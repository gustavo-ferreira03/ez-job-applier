import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { SessionManager, createAgentSession } from "@earendil-works/pi-coding-agent";
import type { ResumeInput } from "resume-ci";
import type { AppContext } from "../../context";
import { getSettings } from "../../../repositories/settings";
import { generateResumePdf } from "../../resumes/pdf";
import { type VncSession } from "../../login/vnc";
import { saveExternalBrowserState, sessionFilePath } from "../../../providers/linkedin/browser";
import { createExternalApplyTools, type JobToolContext } from "./tools";
import { launchBrowserMcp, bridgeBrowserTools, saveBrowserMcpStorageState, type BrowserMcp } from "./mcp";
import { registerSession, postAgentMessage } from "./state";
import { loadAgentMemory, formatAgentMemory } from "./memory";

function fail(jobId: number, error: string): ExternalApplyResult {
    postAgentMessage(jobId, `I couldn't continue: ${error}`);
    return { status: "failed", error };
}

export interface ExternalApplyResult {
    status: "submitted" | "aborted" | "stalled" | "failed";
    error?: string;
}

async function loadResume(ctx: AppContext, jobId: number): Promise<ResumeInput | null> {
    const tailored = await ctx.resumeMasterRepo.readTailored(jobId);
    if (tailored) return tailored;
    const masters = await ctx.resumeMasterRepo.listMasters();
    if (masters.length === 0) return null;
    return ctx.resumeMasterRepo.readMasterParsed(masters[0]);
}

export async function runExternalApply(
    ctx: AppContext,
    jobId: number,
    ensureVnc: () => Promise<VncSession>,
): Promise<ExternalApplyResult> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) return fail(jobId, `Job ${jobId} not found`);
    if (!job.applicationUrl) return fail(jobId, "Job has no external application URL");

    const settings = await getSettings();
    const model = ctx.modelRegistry.find(settings.llm.provider, settings.llm.model);
    if (!model) {
        return fail(jobId, `LLM model not configured (${settings.llm.provider}/${settings.llm.model})`);
    }
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok) {
        return fail(jobId, auth.error ?? `LLM provider not authenticated (${settings.llm.provider})`);
    }

    const workDir = path.join(os.tmpdir(), `ext-apply-${jobId}-${Date.now()}`);
    await fs.mkdir(workDir, { recursive: true });

    let mcp: BrowserMcp | null = null;
    try {
        const resume = await loadResume(ctx, jobId);
        let resumePdfPath: string | undefined;
        if (resume) {
            try {
                const pdf = await generateResumePdf(resume, `resume-job-${jobId}`);
                resumePdfPath = path.join(workDir, "resume.pdf");
                await fs.writeFile(resumePdfPath, pdf);
            } catch (e) {
                console.error(`[external-apply] resume PDF generation failed for job ${jobId}:`, e);
            }
        }

        const jc: JobToolContext = {
            jobId,
            workDir,
            vncSession: null,
            toolCalls: 0,
            aborted: false,
            approvedOnce: false,
            finishStatus: null,
            ensureVnc,
        };

        jc.vncSession = await ensureVnc();
        mcp = await launchBrowserMcp({ workDir, display: jc.vncSession.display, storageStatePath: sessionFilePath });
        const browserTools = bridgeBrowserTools(mcp, jc);
        if (browserTools.length === 0) {
            return fail(jobId, "No browser tools available from playwright-mcp");
        }

        const { session } = await createAgentSession({
            model,
            modelRegistry: ctx.modelRegistry,
            cwd: workDir,
            noTools: "builtin",
            customTools: [...browserTools, ...createExternalApplyTools(jc)],
            sessionManager: (SessionManager as unknown as { inMemory(): unknown }).inMemory() as never,
        });

        registerSession(jobId, {
            steer: (text) => void session.steer(text).catch(() => {}),
            abort: () => void session.abort().catch(() => {}),
        });

        const memoryBlock = formatAgentMemory(await loadAgentMemory());
        const task = [
            "You are an autonomous agent applying to a job on the candidate's behalf via an external application site (an ATS, not LinkedIn). You work mostly on your own; the user watches the live browser and chats with you.",
            "",
            "You drive the browser with the `browser_*` tools. Always call `browser_snapshot` to see the current page and obtain element refs, then act with `browser_click`, `browser_type`, `browser_fill_form`, `browser_select_option`, `browser_file_upload`, etc., passing the `ref` from the latest snapshot. Navigate with `browser_navigate`. The browser is already open with the candidate's LinkedIn session loaded — there is no tool to close or reset it, and you must not try to.",
            "",
            "## Talking to the user",
            "- Use `say` to post a short progress update whenever you complete a meaningful step (opened the page, filled a section, hit an obstacle). Keep the user informed.",
            "- Use `ask_user` when you need information you don't have, are unsure how to proceed, or want a decision. It waits for the user's reply.",
            "- The user may send you a message at any time; it arrives as a normal user message. Follow their instructions and acknowledge with `say`.",
            "- Write to the user in the same language as the job posting.",
            "",
            "## Rules",
            "- You MUST `ask_user` and get an explicit go-ahead before clicking the final submit/apply button. Never submit without it.",
            "- When asking for that final go-ahead, call `ask_user` with nextAction='final_submit'. For missing information or other decisions, use nextAction='needs_input'.",
            "- The browser is managed for you; to go somewhere just use `browser_navigate`. Do not attempt to close or reset it.",
            "- The user's LinkedIn session is already loaded in the browser. NEVER ask the user for their LinkedIn password or try to log in/out of LinkedIn.",
            "- Whenever the site requires you to sign up or log in, ALWAYS prefer the 'Continue with LinkedIn' / 'Sign in with LinkedIn' option when it is available — choose it over creating an email/password account or using any other provider (Google, etc.). The loaded LinkedIn session authenticates it instantly and pre-fills the candidate's data. Only fall back to another sign-up/login method if LinkedIn is not offered.",
            "- If a LinkedIn login page still appears, call `browser_snapshot` again and try the LinkedIn option again; if it truly cannot proceed, call `ask_user` and explain — do not request credentials.",
            "- When navigating to LinkedIn directly, use `https://www.linkedin.com/...` rather than `https://linkedin.com/...`.",
            "- After the user replies or takes over, call `browser_snapshot` before acting — the page may have changed.",
            "- Do not fabricate information you do not have (CPF, birth date, phone, address, salary). If a required field needs it, first check 'Known answers from past applications' below; only `ask_user` if it is not there.",
            "- When you `ask_user` for a reusable personal fact (birthdate, CPF, phone, address, salary expectation, work authorization, years of experience), set remember=true so it is saved for future applications. Leave remember off for job-specific questions.",
            "- When done, call `finish` with status='submitted' (after an approved submit) or 'aborted'.",
            "",
            memoryBlock ? memoryBlock + "\n" : "",
            "## Job",
            `Title: ${job.title}`,
            `Company: ${job.company}`,
            `Application URL: ${job.applicationUrl}`,
            job.about ? `About: ${job.about}` : "",
            "",
            "## Candidate résumé (structured)",
            resume ? JSON.stringify(resume) : "(none available)",
            resumePdfPath ? `\nRésumé PDF for upload: ${resumePdfPath}` : "",
            "",
            "Start by opening the application URL with `browser_navigate`, post a brief `say` that you've started, then call `browser_snapshot` and fill the form from the candidate data.",
        ].filter((line) => line !== "").join("\n");

        const continueTask = [
            "You stopped without completing the application.",
            "Continue from the current browser state now.",
            "If you need information or confirmation, call `ask_user`.",
            "If the application was submitted, call `finish` with status='submitted'.",
            "If you cannot continue, call `ask_user` and explain the blocker instead of ending the turn.",
            "Do not stop without calling either `ask_user` or `finish`.",
        ].join("\n");

        let modelError: string | null = null;
        const unsubscribe = session.subscribe((event) => {
            const e = event as { type?: string; errorMessage?: string; message?: { stopReason?: string; errorMessage?: string }; messages?: { stopReason?: string; errorMessage?: string }[] };
            if (e.type === "auto_retry_start" && e.errorMessage) modelError = e.errorMessage;
            if (e.type === "turn_end" && e.message?.stopReason === "error") modelError = e.message.errorMessage ?? "model error";
            if (e.type === "agent_end") {
                const last = e.messages?.[e.messages.length - 1];
                if (last?.stopReason === "error") modelError = last.errorMessage ?? "model error";
            }
        });

        try {
            for (let attempt = 0; attempt < 3 && !jc.finishStatus && !jc.aborted; attempt += 1) {
                if (attempt > 0) {
                    postAgentMessage(jobId, "I stopped before completing. Trying to continue from the current browser state.");
                }
                modelError = null;
                const toolCallsBefore = jc.toolCalls;
                await session.prompt(attempt === 0 ? task : continueTask);
                if (jc.finishStatus || jc.aborted) break;
                if (jc.toolCalls === toolCallsBefore) {
                    const reason = modelError ?? "the model returned no actions";
                    postAgentMessage(jobId, `I couldn't continue — the AI model isn't responding: ${reason}`);
                    return { status: "failed", error: `Model produced no actions: ${reason}` };
                }
            }
        } finally {
            unsubscribe();
        }

        if (jc.finishStatus === "submitted") return { status: "submitted" };
        if (jc.aborted) return { status: "aborted", error: "Stopped by user" };
        if (jc.finishStatus === "aborted") return { status: "aborted" };
        postAgentMessage(jobId, "I stopped before completing and could not recover automatically. Please retry this application.");
        return { status: "stalled", error: "The agent stopped before submitting" };
    } finally {
        if (mcp) {
            const state = await saveBrowserMcpStorageState(mcp, workDir);
            if (state) await saveExternalBrowserState(state).catch((e) => console.error("[external-apply] failed to persist external browser state:", e));
            await mcp.close().catch(() => {});
        }
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
}

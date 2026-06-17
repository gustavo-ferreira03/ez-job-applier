import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { SessionManager, createAgentSession, loadSkillsFromDir, stripFrontmatter } from "@earendil-works/pi-coding-agent";
import type { ResumeInput } from "resume-ci";
import type { AppContext } from "../../context";
import { getSettings } from "../../../repositories/settings";
import { generateResumePdf } from "../../resumes/pdf";
import { SCREEN_WIDTH, SCREEN_HEIGHT } from "../../login/vnc";
import { createExternalApplyTools, type JobToolContext } from "./tools";
import { registerSession } from "./state";

async function writeBrowserConfig(workDir: string): Promise<void> {
    const config = {
        browser: {
            browserName: "chromium",
            launchOptions: { args: ["--window-position=0,0", `--window-size=${SCREEN_WIDTH},${SCREEN_HEIGHT}`] },
            contextOptions: { viewport: null },
        },
    };
    const dir = path.join(workDir, ".playwright");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "cli.config.json"), JSON.stringify(config, null, 2));
}

const SKILLS_DIR = process.env.CLAUDE_SKILLS_DIR ?? path.join(os.homedir(), ".claude", "skills");

export interface ExternalApplyResult {
    status: "submitted" | "aborted" | "failed";
    error?: string;
}

async function loadPlaywrightSkill(): Promise<string | null> {
    try {
        const { skills } = loadSkillsFromDir({ dir: SKILLS_DIR, source: "external-apply" });
        const skill = skills.find((s) => s.name === "playwright-cli");
        if (!skill) return null;
        return stripFrontmatter(await fs.readFile(skill.filePath, "utf8")).trim();
    } catch (e) {
        console.error(`[external-apply] failed to load playwright-cli skill from ${SKILLS_DIR}:`, e);
        return null;
    }
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
    ensureVnc: () => Promise<void>,
): Promise<ExternalApplyResult> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) return { status: "failed", error: `Job ${jobId} not found` };
    if (!job.applicationUrl) return { status: "failed", error: "Job has no external application URL" };

    const settings = await getSettings();
    const model = ctx.modelRegistry.find(settings.llm.provider, settings.llm.model);
    if (!model) {
        return { status: "failed", error: `LLM model not configured (${settings.llm.provider}/${settings.llm.model})` };
    }
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok) {
        return { status: "failed", error: auth.error ?? `LLM provider not authenticated (${settings.llm.provider})` };
    }

    const workDir = path.join(os.tmpdir(), `ext-apply-${jobId}-${Date.now()}`);
    await fs.mkdir(workDir, { recursive: true });
    await writeBrowserConfig(workDir);

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
            session: `ext-${jobId}`,
            aborted: false,
            approvedOnce: false,
            finishStatus: null,
            ensureVnc,
        };

        const { session } = await createAgentSession({
            model,
            modelRegistry: ctx.modelRegistry,
            cwd: workDir,
            noTools: "builtin",
            customTools: createExternalApplyTools(jc),
            sessionManager: (SessionManager as unknown as { inMemory(): unknown }).inMemory() as never,
        });

        registerSession({
            steer: (text) => void session.steer(text).catch(() => {}),
            abort: () => void session.abort().catch(() => {}),
        });

        const skill = await loadPlaywrightSkill();
        const task = [
            "You are an autonomous agent applying to a job on the candidate's behalf via an external application site (an ATS, not LinkedIn). You work mostly on your own; the user watches the live browser and chats with you.",
            "",
            "You drive the browser only through the `browser` tool: pass the arguments that would follow `playwright-cli` as the `args` array (e.g. `playwright-cli click e15` → args [\"click\", \"e15\"]). The browser session is managed for you — never pass `-s=`, `open --persistent`, `close`, or install commands.",
            skill ? "\n## playwright-cli reference\n" + skill : "",
            "",
            "## Talking to the user",
            "- Use `say` to post a short progress update whenever you complete a meaningful step (opened the page, filled a section, hit an obstacle). Keep the user informed.",
            "- Use `ask_user` when you need information you don't have, are unsure how to proceed, or want a decision. It waits for the user's reply.",
            "- The user may send you a message at any time; it arrives as a normal user message. Follow their instructions and acknowledge with `say`.",
            "- Write to the user in the same language as the job posting.",
            "",
            "## Rules",
            "- You MUST `ask_user` and get an explicit go-ahead before clicking the final submit/apply button. Never submit without it.",
            "- After the user replies or takes over, take a fresh [\"snapshot\"] before acting — the page may have changed.",
            "- Do not fabricate information you do not have (CPF, birth date, phone, address, salary). If a required field needs it, `ask_user`.",
            "- When done, call `finish` with status='submitted' (after an approved submit) or 'aborted'.",
            "",
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
            "Start by opening the application URL with `browser`, post a brief `say` that you've started, then snapshot and fill the form from the candidate data.",
        ].filter((line) => line !== "").join("\n");

        await session.prompt(task);

        if (jc.finishStatus === "submitted") return { status: "submitted" };
        if (jc.aborted) return { status: "aborted", error: "Rejected by user" };
        if (jc.finishStatus === "aborted") return { status: "aborted" };
        return { status: "failed", error: "Agent stopped without submitting" };
    } finally {
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
}

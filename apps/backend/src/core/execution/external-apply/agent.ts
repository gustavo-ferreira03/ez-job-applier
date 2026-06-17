import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SessionManager, createAgentSession } from "@earendil-works/pi-coding-agent";
import type { ResumeInput } from "resume-ci";
import type { AppContext } from "../../context";
import { getSettings } from "../../../repositories/settings";
import { generateResumePdf } from "../../resumes/pdf";
import { createExternalApplyTools, type JobToolContext } from "./tools";

const guidePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "playwright-cli-guide.md");

export interface ExternalApplyResult {
    status: "submitted" | "aborted" | "failed";
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

        const guide = await fs.readFile(guidePath, "utf8");
        const task = [
            "You are an autonomous agent applying to a job on the candidate's behalf via an external application site (an ATS, not LinkedIn).",
            "",
            "## How to control the browser",
            guide,
            "",
            "## Checkpoint rules (mandatory)",
            "- Call `request_approval` at every important step (e.g. after filling a form section, before navigating away) and ALWAYS before the final submit.",
            "- After EACH approval, take a fresh [\"snapshot\"] before acting — the user may have changed the page.",
            "- Never click a final submit/apply button before a `request_approval` for that submit has been approved.",
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
            "Start by opening the application URL, then take a snapshot and proceed. Fill fields from the candidate data. Do not fabricate information you do not have — if a required field cannot be answered, request approval and explain.",
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

import path from "node:path";
import type { AppContext } from "../context";
import type { ApplyResult } from "../types";
import { saveAnswers } from "./answer";

export async function applyToJob(
    jobId: number,
    answers: Record<string, string> = {},
    ctx: AppContext,
    resumeFilename?: string,
): Promise<ApplyResult> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    await saveAnswers(jobId, answers, ctx);

    const application = await ctx.appRepo.get(job.provider, job.jobId);
    const allAnswers: Record<string, string> = {};
    if (application) {
        const questions = await ctx.appRepo.getQuestions(application.id);
        for (const q of questions) {
            if (q.answer) allAnswers[q.label] = q.answer;
        }
    }

    const provider = ctx.providerRegistry.getForJob(job);
    const session = await provider.createSession();

    try {
        const defaultResumePath = await ctx.resumeRepo.getDefaultResumePath();
        const resumePath = resumeFilename
            ? await ctx.resumeRepo.getResumePath(resumeFilename)
            : defaultResumePath;
        const resolvedFilename = resumePath ? path.basename(resumePath) : undefined;

        const result = await session.apply(job, allAnswers, resumePath ?? undefined);

        const updated = await ctx.appRepo.upsert(
            job.provider,
            job.jobId,
            result.status,
            resolvedFilename,
            result.errorMessage,
        );
        await ctx.appRepo.replaceQuestions(updated.id, result.questions);

        return result;
    } finally {
        await session.close();
    }
}

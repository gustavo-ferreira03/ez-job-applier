import path from "node:path";
import type { AppContext } from "../context";
import type { ApplyResult } from "../types";

export async function applyToJob(
    jobId: number,
    answers: Record<string, string> = {},
    ctx: AppContext,
): Promise<ApplyResult> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const existing = await ctx.appRepo.get(job.provider, job.jobId);
    if (existing) {
        const persisted = await ctx.appRepo.getQuestions(existing.id);
        for (const q of persisted) {
            if (q.answer && !answers[q.label]) {
                answers[q.label] = q.answer;
            }
        }
    }

    const resumePath = await ctx.resumeRepo.getDefaultResumePath();
    const resumeFilename = resumePath ? path.basename(resumePath) : undefined;

    const provider = ctx.providerRegistry.getForJob(job);
    const session = await provider.createSession();

    try {
        const result = await session.apply(job, answers, resumePath);

        const application = await ctx.appRepo.upsert(
            job.provider,
            job.jobId,
            result.status,
            resumeFilename,
            result.errorMessage,
        );
        await ctx.appRepo.replaceQuestions(application.id, result.questions);

        return result;
    } finally {
        await session.close();
    }
}

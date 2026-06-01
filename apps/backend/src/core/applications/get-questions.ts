import path from "node:path";
import type { AppContext } from "../context";
import type { ApplyResult } from "../types";

export async function getQuestions(jobId: number, ctx: AppContext): Promise<ApplyResult> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const provider = ctx.providerRegistry.getForJob(job);
    const session = await provider.createSession();

    try {
        const resumePath = await ctx.resumeRepo.getDefaultResumePath();
        const resumeFilename = resumePath ? path.basename(resumePath) : undefined;

        const result = await session.getQuestions(job, resumePath);

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
        await session.close().catch(() => undefined);
    }
}

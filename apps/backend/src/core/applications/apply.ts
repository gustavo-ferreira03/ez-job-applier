import type { AppContext } from "../context";
import { saveAnswers } from "./answer";
import { wakeExecution } from "../execution/manager";

export async function applyToJob(
    jobId: number,
    answers: Record<string, string> = {},
    ctx: AppContext,
    resumeFilename?: string,
): Promise<void> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    await saveAnswers(jobId, answers, ctx);

    const application = await ctx.appRepo.get(job.provider, job.jobId);
    if (!application) throw new Error(`No application found for job ${jobId}`);

    await ctx.appRepo.updateStatus(application.id, "READY_FOR_REVIEW");

    if (resumeFilename) {
        await ctx.appRepo.upsert(job.provider, job.jobId, "READY_FOR_REVIEW", resumeFilename);
    }

    wakeExecution();
}

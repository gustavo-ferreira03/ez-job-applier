import type { AppContext } from "../context";
import type { ApplyResult } from "../types";
import { saveAnswers } from "./answer";

export async function applyToJob(
    jobId: number,
    answers: Record<string, string> = {},
    ctx: AppContext,
): Promise<ApplyResult> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    await saveAnswers(jobId, answers, ctx);

    const application = await ctx.appRepo.get(job.provider, job.jobId);
    if (!application) throw new Error(`No application found for job ${jobId}`);

    await ctx.appRepo.updateStatus(application.id, "APPROVED");

    const questions = await ctx.appRepo.getQuestions(application.id);
    return { status: "APPROVED", questions };
}

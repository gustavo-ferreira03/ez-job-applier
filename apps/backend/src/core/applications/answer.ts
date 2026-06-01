import type { AppContext } from "../context";

export async function saveAnswers(
    jobId: number,
    answers: Record<string, string>,
    ctx: AppContext,
): Promise<void> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const application = await ctx.appRepo.get(job.provider, job.jobId);
    if (!application)
        throw new Error(
            `No application found for job ${jobId}. Call POST /jobs/${jobId}/questions first.`,
        );

    await ctx.appRepo.answerQuestions(application.id, answers);
}

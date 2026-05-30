import type { AppContext } from "../context";

export async function skipJob(jobId: number, ctx: AppContext): Promise<void> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    await ctx.appRepo.upsert(job.provider, job.jobId, "SKIPPED");
}

import type { AppContext } from "../context";
import type { ApplicationStatus } from "../types";

const REJECTABLE_STATUSES = new Set<ApplicationStatus>([
    "FOUND",
    "NEEDS_INPUT",
    "READY_FOR_REVIEW",
    "FAILED",
]);

export async function rejectJob(jobId: number, ctx: AppContext): Promise<void> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const application = await ctx.appRepo.get(job.provider, job.jobId);
    if (application?.processing) throw new Error(`Job ${jobId} is processing`);
    if (application && !REJECTABLE_STATUSES.has(application.status)) {
        throw new Error(`Job ${jobId} cannot be rejected`);
    }

    if (application) {
        await ctx.appRepo.updateStatus(application.id, "REJECTED");
        return;
    }

    await ctx.appRepo.upsert(job.provider, job.jobId, "REJECTED");
}

export async function rejectJobsByIds(ids: number[], ctx: AppContext): Promise<number> {
    let rejected = 0;
    for (const id of ids) {
        const job = await ctx.jobRepo.getById(id);
        if (!job) continue;
        const application = await ctx.appRepo.get(job.provider, job.jobId);
        if (application) {
            if (application.processing || !REJECTABLE_STATUSES.has(application.status)) continue;
            await ctx.appRepo.updateStatus(application.id, "REJECTED");
        } else {
            await ctx.appRepo.upsert(job.provider, job.jobId, "REJECTED");
        }
        rejected += 1;
    }
    return rejected;
}

export async function reprocessJob(jobId: number, ctx: AppContext): Promise<void> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const application = await ctx.appRepo.get(job.provider, job.jobId);
    if (!application) throw new Error(`Application for job ${jobId} not found`);
    if (application.processing) throw new Error(`Job ${jobId} is processing`);
    if (application.status !== "FAILED") throw new Error(`Job ${jobId} is not failed`);

    await ctx.appRepo.updateStatus(application.id, "FOUND");
}

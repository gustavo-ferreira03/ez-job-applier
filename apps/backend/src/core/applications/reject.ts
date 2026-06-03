import type { AppContext } from "../context";
import type { ApplicationStatus } from "../types";

const REJECTABLE_STATUSES = new Set<ApplicationStatus>([
    "FOUND",
    "NEEDS_INPUT",
    "READY_FOR_REVIEW",
    "EXTERNAL",
    "FAILED",
]);

function rejectableStatuses(statuses: ApplicationStatus[]): ApplicationStatus[] {
    return statuses.filter((status) => REJECTABLE_STATUSES.has(status));
}

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

export async function rejectJobsByStatus(statuses: ApplicationStatus[], ctx: AppContext): Promise<number> {
    const allowed = rejectableStatuses(statuses);
    let rejected = await ctx.appRepo.rejectByStatuses(allowed);

    if (allowed.includes("FOUND")) {
        const foundWithoutApplication = await ctx.appRepo.listFoundJobIds();
        for (const jobId of foundWithoutApplication) {
            const job = await ctx.jobRepo.getById(jobId);
            if (!job) continue;
            await ctx.appRepo.upsert(job.provider, job.jobId, "REJECTED");
            rejected += 1;
        }
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

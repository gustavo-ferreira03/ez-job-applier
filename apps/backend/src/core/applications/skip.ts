import { getJobById } from "../../repositories/jobs/services/storage";
import { upsertApplication } from "../../repositories/applications/services/storage";

export async function skipJob(jobId: number): Promise<void> {
    const job = await getJobById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    await upsertApplication(job.provider, job.jobId, "SKIPPED");
}

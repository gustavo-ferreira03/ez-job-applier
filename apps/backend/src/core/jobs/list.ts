import type { AppContext } from "../context";
import type { JobSummary } from "./types";
import { tailoringJobIds } from "../resumes/tailor-status";

export async function listJobs(ctx: AppContext): Promise<JobSummary[]> {
    const jobs = await ctx.jobRepo.listSummaries();
    // Decorated here rather than in the repository: "is tailoring" is in-process runtime state,
    // not persisted data.
    const tailoring = new Set(tailoringJobIds());
    return jobs.map((job) => ({ ...job, tailoring: tailoring.has(job.id) }));
}

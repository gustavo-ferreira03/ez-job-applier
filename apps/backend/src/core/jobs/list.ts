import type { AppContext } from "../context";
import type { JobSummary } from "./types";

export async function listJobs(ctx: AppContext): Promise<JobSummary[]> {
    return ctx.jobRepo.listSummaries();
}

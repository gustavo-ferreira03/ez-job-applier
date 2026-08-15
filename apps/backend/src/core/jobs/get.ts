import type { AppContext } from "../context";
import type { JobDetail } from "./types";
import { isTailoring } from "../resumes/tailor-status";

export async function getJob(id: number, ctx: AppContext): Promise<JobDetail | null> {
    const job = await ctx.jobRepo.getDetail(id);
    if (!job) return null;
    return { ...job, tailoring: isTailoring(id) };
}

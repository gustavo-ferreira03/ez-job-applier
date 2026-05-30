import type { AppContext } from "../context";
import type { JobDetail } from "./types";

export async function getJob(id: number, ctx: AppContext): Promise<JobDetail | null> {
    return ctx.jobRepo.getDetail(id);
}

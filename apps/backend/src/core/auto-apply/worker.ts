import { getQuestions } from "../applications/get-questions";
import { applyToJob } from "../applications/apply";
import { isStopRequested, setRunning, incrementApplied, incrementFailed, getCtx } from "./manager";

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runLoop(): Promise<void> {
    try {
        while (!isStopRequested()) {
            const ctx = getCtx();

            // Phase 1: collect questions for FOUND jobs (no application yet)
            const foundIds = await ctx.appRepo.listFoundJobIds();
            for (const jobId of foundIds) {
                if (isStopRequested()) break;
                try {
                    await getQuestions(jobId, ctx);
                } catch (e) {
                    console.error(`Auto-apply: getQuestions failed for job ${jobId}:`, e);
                }
                await sleep(3000);
            }

            if (isStopRequested()) break;

            // Phase 2: submit READY_FOR_REVIEW jobs
            const readyIds = await ctx.appRepo.listIdsByStatus("READY_FOR_REVIEW");
            for (const jobId of readyIds) {
                if (isStopRequested()) break;
                try {
                    await applyToJob(jobId, {}, ctx);
                    incrementApplied();
                } catch (e) {
                    console.error(`Auto-apply: apply failed for job ${jobId}:`, e);
                    incrementFailed();
                }
                await sleep(3000);
            }

            if (foundIds.length === 0 && readyIds.length === 0) {
                await sleep(5000);
            }
        }
    } finally {
        setRunning(false);
    }
}

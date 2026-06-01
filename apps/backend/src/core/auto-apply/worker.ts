import { getQuestions } from "../applications/get-questions";
import { isStopRequested, setRunning, getCtx } from "./manager";

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runExecution(): Promise<void> {
    try {
        while (!isStopRequested()) {
            const ctx = getCtx();

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

            if (foundIds.length === 0) {
                await sleep(5000);
            }
        }
    } finally {
        setRunning(false);
    }
}

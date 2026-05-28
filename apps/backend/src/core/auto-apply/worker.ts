import { listJobIdsByStatus } from "../../repositories/applications/services/storage";
import { applyToJob } from "../applications/apply";
import { isStopRequested, setRunning, incrementApplied, incrementFailed } from "./manager";

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runLoop(): Promise<void> {
    try {
        while (!isStopRequested()) {
            const jobIds = await listJobIdsByStatus("READY_FOR_REVIEW");

            if (jobIds.length === 0) {
                await sleep(5000);
                continue;
            }

            for (const jobId of jobIds) {
                if (isStopRequested()) break;
                try {
                    await applyToJob(jobId);
                    incrementApplied();
                } catch (e) {
                    console.error(`Auto-apply failed for job ${jobId}:`, e);
                    incrementFailed();
                }
                await sleep(3000);
            }
        }
    } finally {
        setRunning(false);
    }
}

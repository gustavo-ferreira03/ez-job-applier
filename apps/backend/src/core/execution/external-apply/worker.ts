import type { AppContext } from "../../context";
import { getSettings } from "../../../repositories/settings";
import { startVncStack, stopVncStack } from "../../login/vnc";
import { acquireVnc, releaseVnc } from "../../login/vnc-lock";
import { runExternalApply } from "./agent";
import { beginJob, endJob, type ExternalApplyPhase } from "./state";

async function processOne(jobId: number, ctx: AppContext): Promise<void> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job || job.applicationUrl == null) return;

    let vncStarted = false;
    const ensureVnc = async (): Promise<void> => {
        if (vncStarted) return;
        await acquireVnc();
        try {
            await startVncStack();
            vncStarted = true;
        } catch (e) {
            releaseVnc();
            throw e;
        }
    };

    const onPhase = (phase: ExternalApplyPhase): void => {
        if (phase === "working") {
            ctx.appRepo.upsert(job.provider, job.jobId, "FOUND").catch(() => {});
        } else if (phase === "waiting") {
            ctx.appRepo.upsert(job.provider, job.jobId, "NEEDS_INPUT").catch(() => {});
        }
    };

    beginJob(jobId, job.title, onPhase);
    const tag = `[external-apply] "${job.title}" @ ${job.company}`;
    try {
        const result = await runExternalApply(ctx, jobId, ensureVnc);
        if (result.status === "submitted") {
            await ctx.appRepo.upsert(job.provider, job.jobId, "READY_FOR_REVIEW");
            endJob("submitted");
            console.log(`${tag}: submitted → review`);
        } else {
            await ctx.appRepo.upsert(job.provider, job.jobId, "FAILED", undefined, result.error ?? "Not submitted");
            endJob("failed");
            console.log(`${tag}: ${result.status}${result.error ? ` — ${result.error}` : ""}`);
        }
    } catch (e) {
        await ctx.appRepo.upsert(job.provider, job.jobId, "FAILED", undefined, String(e));
        endJob("failed");
        console.error(`${tag}: error`, e);
    } finally {
        if (vncStarted) {
            stopVncStack();
            releaseVnc();
        }
    }
}

export function createExternalApplyWorker(ctx: AppContext, shouldStop: () => boolean) {
    let _wake: (() => void) | null = null;

    function workerSleep(ms: number): Promise<void> {
        return new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, ms);
            _wake = () => { clearTimeout(timer); resolve(); };
        });
    }

    async function run(): Promise<void> {
        const attempted = new Set<number>();

        while (!shouldStop()) {
            const exec = await ctx.executionRepo.getActive();
            if (exec?.status === "paused") {
                await workerSleep(5_000);
                continue;
            }

            const settings = await getSettings();
            if (!settings.llm.externalApply) {
                await workerSleep(30_000);
                continue;
            }

            const found = await ctx.appRepo.listIdsByStatus("FOUND");
            const pending: number[] = [];
            for (const jobId of found) {
                if (attempted.has(jobId)) continue;
                const job = await ctx.jobRepo.getById(jobId);
                if (job?.applicationUrl != null) pending.push(jobId);
            }

            if (pending.length === 0) {
                await workerSleep(30_000);
                continue;
            }

            for (const jobId of pending) {
                if (shouldStop()) break;
                attempted.add(jobId);
                await processOne(jobId, ctx);
            }
        }
    }

    function wake(): void {
        _wake?.();
        _wake = null;
    }

    return { run, wake };
}

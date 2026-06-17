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

    let terminal = false;
    let statusChain: Promise<void> = Promise.resolve();
    const writeStatus = (status: "FOUND" | "NEEDS_INPUT" | "READY_FOR_REVIEW" | "FAILED", error?: string): Promise<void> => {
        statusChain = statusChain.then(() =>
            ctx.appRepo.upsert(job.provider, job.jobId, status, undefined, error).then(() => {}).catch(() => {}),
        );
        return statusChain;
    };

    const onPhase = (phase: ExternalApplyPhase): void => {
        if (terminal) return;
        if (phase === "working") writeStatus("FOUND");
        else if (phase === "waiting") writeStatus("NEEDS_INPUT");
    };

    beginJob(jobId, job.title, onPhase);
    const tag = `[external-apply] "${job.title}" @ ${job.company}`;
    try {
        const result = await runExternalApply(ctx, jobId, ensureVnc);
        terminal = true;
        if (result.status === "submitted") {
            await writeStatus("READY_FOR_REVIEW");
            endJob("submitted");
            console.log(`${tag}: submitted → review`);
        } else {
            await writeStatus("FAILED", result.error ?? "Not submitted");
            endJob("failed");
            console.log(`${tag}: ${result.status}${result.error ? ` — ${result.error}` : ""}`);
        }
    } catch (e) {
        terminal = true;
        await writeStatus("FAILED", String(e));
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

    async function resetOrphans(): Promise<void> {
        for (const jobId of await ctx.appRepo.listIdsByStatus("NEEDS_INPUT")) {
            const job = await ctx.jobRepo.getById(jobId);
            if (job?.applicationUrl != null) {
                await ctx.appRepo.upsert(job.provider, job.jobId, "FOUND").catch(() => {});
            }
        }
    }

    async function run(): Promise<void> {
        await resetOrphans();
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

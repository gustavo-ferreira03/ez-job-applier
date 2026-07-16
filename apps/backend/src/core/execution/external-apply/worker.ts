import type { AppContext } from "../../context";
import { getSettings } from "../../../repositories/settings";
import { startVncStack, stopVncStack, type VncSession } from "../../login/vnc";
import { runExternalApply } from "./agent";
import {
    beginJob,
    endJob,
    isExternalApplyActive,
    releaseWorkingSlotReservation,
    tryReserveWorkingSlot,
    workingExternalApplySlots,
    getMaxWorkingExternalApply,
    setMaxWorkingExternalApply,
    type ExternalApplyPhase,
} from "./state";

type ProcessOutcome = "done" | "retryable";

async function processOne(jobId: number, ctx: AppContext): Promise<ProcessOutcome> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job || job.applicationUrl == null) return "done";
    const application = await ctx.appRepo.get(job.provider, job.jobId);
    if (application?.status === "REJECTED") return "done";

    let vncSession: VncSession | null = null;
    const ensureVnc = async (): Promise<VncSession> => {
        if (vncSession) return vncSession;
        vncSession = await startVncStack("external-apply");
        return vncSession;
    };
    const releaseVnc = (): void => {
        if (vncSession) {
            stopVncStack(vncSession);
            vncSession = null;
        }
    };

    let terminal = false;
    let statusChain: Promise<void> = Promise.resolve();
    const writeStatus = (status: "NEEDS_INPUT" | "READY_FOR_REVIEW" | "SUBMITTED" | "FAILED", error?: string): Promise<void> => {
        statusChain = statusChain.then(() =>
            ctx.appRepo.get(job.provider, job.jobId)
                .then((application) => {
                    if (application?.status === "REJECTED") return;
                    return ctx.appRepo.upsert(job.provider, job.jobId, status, undefined, error).then(() => {});
                })
                .catch(() => {}),
        );
        return statusChain;
    };

    const onPhase = (phase: ExternalApplyPhase): void => {
        if (terminal) return;
        if (phase === "waiting") writeStatus("NEEDS_INPUT");
        else if (phase === "review") writeStatus("READY_FOR_REVIEW");
    };

    const tag = `[external-apply] "${job.title}" @ ${job.company}`;
    try {
        const session = await ensureVnc();
        beginJob(jobId, job.title, session.id, onPhase);
        const result = await runExternalApply(ctx, jobId, ensureVnc, releaseVnc);
        terminal = true;
        if (result.status === "submitted") {
            await writeStatus("SUBMITTED");
            endJob(jobId, "submitted");
            console.log(`${tag}: submitted`);
            return "done";
        } else if (result.status === "stalled") {
            await writeStatus("NEEDS_INPUT", result.error ?? "Agent stopped before submitting");
            endJob(jobId, "failed");
            console.log(`${tag}: stalled${result.error ? ` — ${result.error}` : ""}`);
            return "retryable";
        } else {
            await writeStatus("FAILED", result.error ?? "Not submitted");
            endJob(jobId, "failed");
            console.log(`${tag}: ${result.status}${result.error ? ` — ${result.error}` : ""}`);
            return "done";
        }
    } catch (e) {
        terminal = true;
        await writeStatus("FAILED", String(e));
        endJob(jobId, "failed");
        console.error(`${tag}: error`, e);
        return "done";
    } finally {
        stopVncStack(vncSession);
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
        const inFlight = new Set<number>();

        const launch = (jobId: number): void => {
            if (!tryReserveWorkingSlot(jobId)) return;
            attempted.add(jobId);
            inFlight.add(jobId);
            processOne(jobId, ctx)
                .then((outcome) => {
                    if (outcome === "retryable") attempted.delete(jobId);
                })
                .catch((e) => console.error(`[external-apply] worker crashed for job ${jobId}:`, e))
                .finally(() => {
                    releaseWorkingSlotReservation(jobId);
                    inFlight.delete(jobId);
                    wake();
                });
        };

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
            setMaxWorkingExternalApply(settings.advanced.externalApplyConcurrency);

            const candidateIds = [
                ...await ctx.appRepo.listIdsByStatus("FOUND"),
                ...await ctx.appRepo.listIdsByStatus("NEEDS_INPUT"),
                ...await ctx.appRepo.listIdsByStatus("READY_FOR_REVIEW"),
            ];
            const pending: number[] = [];
            for (const jobId of new Set(candidateIds)) {
                if (attempted.has(jobId)) continue;
                if (inFlight.has(jobId) || isExternalApplyActive(jobId)) continue;
                const job = await ctx.jobRepo.getById(jobId);
                if (job?.applicationUrl != null) pending.push(jobId);
            }

            const capacity = getMaxWorkingExternalApply() - workingExternalApplySlots();
            if (pending.length === 0 || capacity <= 0) {
                await workerSleep(30_000);
                continue;
            }

            for (const jobId of pending.slice(0, capacity)) {
                if (shouldStop()) break;
                launch(jobId);
            }

            await workerSleep(1_000);
        }
    }

    function wake(): void {
        _wake?.();
        _wake = null;
    }

    return { run, wake };
}

export async function startExternalApplyForJob(jobId: number, ctx: AppContext): Promise<{ started: boolean; reason?: string }> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job || job.applicationUrl == null) return { started: false, reason: "not an external job" };
    if (isExternalApplyActive(jobId)) return { started: false, reason: "already running" };
    if (!tryReserveWorkingSlot(jobId)) return { started: false, reason: "no free slot" };
    void processOne(jobId, ctx)
        .catch((e) => console.error(`[external-apply] on-demand crashed for job ${jobId}:`, e))
        .finally(() => releaseWorkingSlotReservation(jobId));
    return { started: true };
}

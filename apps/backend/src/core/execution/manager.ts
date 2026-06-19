import crypto from "node:crypto";
import type { AppContext } from "../context";
import type { DiscoverConfig } from "../types";
import type { IJobProviderSession } from "../interfaces";
import { runCycle } from "./cycle";
import { isWithinSchedule, nextScheduleOpen } from "./schedule";
import { getSettings } from "../../repositories/settings";
import { startVncStack, stopVncStack, openLoginBrowser, waitForLogin, type VncSession } from "../login/vnc";

export type WorkerFactory = (ctx: AppContext, shouldStop: () => boolean) => { run(): Promise<void>; wake(): void };

const _workerFactories: WorkerFactory[] = [];

export function registerWorker(factory: WorkerFactory): void {
    _workerFactories.push(factory);
}

const DEFAULT_CYCLE_MAX_MS = 3_600_000;
const DEFAULT_INTERVAL_MS  = 14_400_000;

let _stopFlag = false;
let _wake: (() => void) | null = null;
let _activeSession: IJobProviderSession | null = null;
let _activeWorkers: { wake(): void }[] = [];
let _loginVncSessionId: string | null = null;
let _executionVncSessionId: string | null = null;

function wakeUp(): void { _wake?.(); _wake = null; }

export function wakeExecution(): void { wakeUp(); }

export function getExecutionVncSessionId(): string | null { return _loginVncSessionId ?? _executionVncSessionId; }

function interruptibleSleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        _wake = () => { clearTimeout(timer); resolve(); };
    });
}

export async function startExecution(
    config: DiscoverConfig,
    ctx: AppContext,
    opts?: { cycleMaxMs?: number; intervalMs?: number; existingId?: string },
): Promise<void> {
    const active = await ctx.executionRepo.getActive();
    if (active && active.id !== opts?.existingId) throw new Error("Execution already active");

    const cycleMaxMs = opts?.cycleMaxMs ?? DEFAULT_CYCLE_MAX_MS;
    const intervalMs = opts?.intervalMs ?? DEFAULT_INTERVAL_MS;
    const id = opts?.existingId ?? crypto.randomUUID();

    if (!opts?.existingId) {
        await ctx.executionRepo.create(id, config, cycleMaxMs, intervalMs);
    } else {
        await ctx.executionRepo.setStatus(id, "running");
    }

    _stopFlag = false;
    runForever(id, config, cycleMaxMs, intervalMs, ctx).catch((e) =>
        console.error("[execution] crashed:", e),
    );
    _activeWorkers = _workerFactories.map((factory) => {
        const worker = factory(ctx, () => _stopFlag);
        worker.run().catch((e) => console.error("[worker] crashed:", e));
        return worker;
    });
}

export async function stopExecution(ctx: AppContext): Promise<void> {
    const active = await ctx.executionRepo.getActive();
    _stopFlag = true;
    wakeUp();
    for (const w of _activeWorkers) w.wake();
    _activeWorkers = [];
    if (_activeSession) {
        await _activeSession.close().catch(console.error);
        _activeSession = null;
    }
    if (active) await ctx.executionRepo.setStatus(active.id, "cancelled");
}

export async function pauseExecution(ctx: AppContext): Promise<void> {
    const active = await ctx.executionRepo.getActive();
    if (active) await ctx.executionRepo.setStatus(active.id, "paused");
    wakeUp();
}

export async function resumeExecution(ctx: AppContext): Promise<void> {
    const active = await ctx.executionRepo.getActive();
    if (active) await ctx.executionRepo.setStatus(active.id, "running", null);
    wakeUp();
}

async function runForever(
    id: string,
    config: DiscoverConfig,
    cycleMaxMs: number,
    intervalMs: number,
    ctx: AppContext,
): Promise<void> {
    try {
        while (!_stopFlag) {
            while (!_stopFlag) {
                const ex = await ctx.executionRepo.get(id);
                if (!ex || ex.status !== "paused") break;
                await interruptibleSleep(5_000);
            }
            if (_stopFlag) break;

            const gateSchedule = (await getSettings()).advanced.schedule;
            if (gateSchedule.enabled && !isWithinSchedule(gateSchedule)) {
                const open = nextScheduleOpen(gateSchedule);
                const sleepMs = open ? Math.max(1_000, open.getTime() - Date.now()) : 3_600_000;
                await ctx.executionRepo.setStatus(id, "waiting", open?.toISOString() ?? null);
                console.log(`[execution] outside schedule — waiting until ${open?.toISOString() ?? "an active day"}`);
                await interruptibleSleep(sleepMs);
                continue;
            }

            await ctx.executionRepo.setStatus(id, "running", null);
            let easyApplyLimited = false;
            let cycleErrored = false;
            let executionVncSession: VncSession | null = null;
            const prevLinkedinDisplay = process.env.LINKEDIN_BROWSER_DISPLAY;
            try {
                const settings = await getSettings();
                if (settings.advanced.browserVisible) {
                    executionVncSession = await startVncStack("linkedin");
                    _executionVncSessionId = executionVncSession.id;
                    process.env.LINKEDIN_BROWSER_DISPLAY = executionVncSession.display;
                }
                const result = await runCycle(id, config, cycleMaxMs, ctx, () => _stopFlag, (s) => { _activeSession = s; });
                easyApplyLimited = result.easyApplyLimited;
            } catch (e) {
                cycleErrored = true;
                const msg = e instanceof Error ? e.message : String(e);
                if (isAuthError(msg)) {
                    console.log("[execution] auth error detected — entering action_needed");
                    const resumed = await handleActionNeeded(id, ctx);
                    if (!resumed) break;
                    continue;
                }
                console.error("[execution] cycle error:", e);
            } finally {
                if (prevLinkedinDisplay !== undefined) process.env.LINKEDIN_BROWSER_DISPLAY = prevLinkedinDisplay;
                else delete process.env.LINKEDIN_BROWSER_DISPLAY;
                stopVncStack(executionVncSession);
                _executionVncSessionId = null;
            }

            if (_stopFlag) break;

            const pending = (easyApplyLimited || cycleErrored) ? [] : await ctx.appRepo.listIdsByStatus("APPROVED");
            if (pending.length > 0) {
                console.log(`[execution] ${pending.length} job(s) ready for submission — restarting cycle`);
                continue;
            }

            let nextRun = new Date(Date.now() + intervalMs);
            const waitSchedule = (await getSettings()).advanced.schedule;
            if (waitSchedule.enabled) {
                const open = nextScheduleOpen(waitSchedule, nextRun);
                if (open) nextRun = open;
            }
            const nextRunAt = nextRun.toISOString();
            await ctx.executionRepo.setStatus(id, "waiting", nextRunAt);
            console.log(`[execution] waiting until ${nextRunAt}`);
            await interruptibleSleep(Math.max(1_000, nextRun.getTime() - Date.now()));
        }
    } finally {
        const ex = await ctx.executionRepo.get(id);
        if (ex && !["done", "failed", "cancelled"].includes(ex.status)) {
            await ctx.executionRepo.setStatus(id, "done");
        }
    }
}

function isAuthError(msg: string): boolean {
    return msg.toLowerCase().includes("session expired") ||
           msg.toLowerCase().includes("log in again") ||
           msg.toLowerCase().includes("auth wall");
}

async function handleActionNeeded(id: string, ctx: AppContext): Promise<boolean> {
    let vncSession: VncSession | null = null;
    try {
        try {
            vncSession = await startVncStack("login");
            _loginVncSessionId = vncSession.id;
        } catch (e) {
            console.error("[login] VNC stack failed to start (is x11vnc installed?):", e);
            return false;
        }
        let loginContext;
        try {
            loginContext = await openLoginBrowser(vncSession);
        } catch (e) {
            console.error("[login] failed to open login browser:", e);
            stopVncStack(vncSession);
            _loginVncSessionId = null;
            return false;
        }
        await ctx.executionRepo.setStatus(id, "action_needed");
        const loggedIn = await waitForLogin(loginContext, () => _stopFlag);
        stopVncStack(vncSession);
        _loginVncSessionId = null;
        if (loggedIn) {
            console.log("[login] session restored — resuming execution");
        }
        return loggedIn;
    } finally {
        if (vncSession) stopVncStack(vncSession);
        _loginVncSessionId = null;
    }
}

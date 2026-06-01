import crypto from "node:crypto";
import type { AppContext } from "../context";
import type { DiscoverConfig } from "../types";
import type { IJobProviderSession } from "../interfaces";
import { runCycle } from "./cycle";
import { startVncStack, stopVncStack, openLoginBrowser, waitForLogin } from "../login/vnc";

const DEFAULT_CYCLE_MAX_MS = 3_600_000;
const DEFAULT_INTERVAL_MS  = 14_400_000;

let _stopFlag = false;
let _wake: (() => void) | null = null;
let _activeSession: IJobProviderSession | null = null;

function wakeUp(): void { _wake?.(); _wake = null; }

export function nudgeExecution(): void { wakeUp(); }

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
}

export async function stopExecution(ctx: AppContext): Promise<void> {
    const active = await ctx.executionRepo.getActive();
    _stopFlag = true;
    wakeUp();
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

            await ctx.executionRepo.setStatus(id, "running", null);
            try {
                await runCycle(id, config, cycleMaxMs, ctx, () => _stopFlag, (s) => { _activeSession = s; });
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                if (isAuthError(msg)) {
                    console.log("[execution] auth error detected — entering action_needed");
                    const resumed = await handleActionNeeded(id, ctx);
                    if (!resumed) break;
                    continue;
                }
                console.error("[execution] cycle error:", e);
            }

            if (_stopFlag) break;

            const nextRunAt = new Date(Date.now() + intervalMs).toISOString();
            await ctx.executionRepo.setStatus(id, "waiting", nextRunAt);
            console.log(`[execution] waiting until ${nextRunAt}`);
            await interruptibleSleep(intervalMs);
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
    await ctx.executionRepo.setStatus(id, "action_needed");
    try {
        await startVncStack();
    } catch (e) {
        console.error("[login] VNC stack failed to start (is x11vnc installed?):", e);
        return false;
    }
    let loginContext;
    try {
        loginContext = await openLoginBrowser();
    } catch (e) {
        console.error("[login] failed to open login browser:", e);
        stopVncStack();
        return false;
    }
    const loggedIn = await waitForLogin(loginContext, () => _stopFlag);
    stopVncStack();
    if (loggedIn) {
        console.log("[login] session restored — resuming execution");
    }
    return loggedIn;
}

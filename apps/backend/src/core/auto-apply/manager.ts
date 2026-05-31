import type { AppContext } from "../context";

export interface AutoApplyStatus {
    running: boolean;
    applied: number;
    failed: number;
}

let state: AutoApplyStatus = { running: false, applied: 0, failed: 0 };
let stopFlag = false;
let _ctx: AppContext | null = null;

export function getStatus(): AutoApplyStatus {
    return { ...state };
}

export function isStopRequested(): boolean {
    return stopFlag;
}

export function getCtx(): AppContext {
    if (!_ctx) throw new Error("Auto-apply not started: no AppContext");
    return _ctx;
}

export function setRunning(value: boolean): void {
    state.running = value;
}

export function incrementApplied(): void {
    state.applied++;
}

export function incrementFailed(): void {
    state.failed++;
}

export function start(ctx: AppContext): void {
    if (state.running) return;
    _ctx = ctx;
    state = { running: true, applied: 0, failed: 0 };
    stopFlag = false;
    import("./worker").then(({ runExecution }) => runExecution().catch(console.error));
}

export function stop(): void {
    stopFlag = true;
}

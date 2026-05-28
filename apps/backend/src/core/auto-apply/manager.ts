export interface AutoApplyStatus {
    running: boolean;
    applied: number;
    failed: number;
}

let state: AutoApplyStatus = { running: false, applied: 0, failed: 0 };
let stopFlag = false;

export function getStatus(): AutoApplyStatus {
    return { ...state };
}

export function isStopRequested(): boolean {
    return stopFlag;
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

export function start(): void {
    if (state.running) return;
    state = { running: true, applied: 0, failed: 0 };
    stopFlag = false;
    // Import lazily to avoid circular dependency at module init time
    import("./worker").then(({ runLoop }) => runLoop().catch(console.error));
}

export function stop(): void {
    stopFlag = true;
}

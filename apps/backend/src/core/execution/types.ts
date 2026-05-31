export interface ExecutionStatus {
    active: boolean;
    running: boolean;
    paused: boolean;
    nextRunAt: string | null;
    cycleMaxMs: number;
    intervalMs: number;
}

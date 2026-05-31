import type { DiscoverConfig } from "../types";
import type { ExecutionStatusValue } from "../../db/schema";

export type { ExecutionStatusValue };

export interface Execution {
    id: string;
    config: DiscoverConfig;
    status: ExecutionStatusValue;
    discovered: number;
    cycleMaxMs: number;
    intervalMs: number;
    nextRunAt: string | null;
    startedAt: string;
    finishedAt: string | null;
    errorMessage: string | null;
}

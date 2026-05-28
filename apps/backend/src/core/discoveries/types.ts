import type { DiscoverConfig } from "../types";

export type DiscoveryStatus = "running" | "done" | "failed" | "cancelled";

export interface DiscoveryJob {
    id: string;
    provider: string;
    config: DiscoverConfig;
    status: DiscoveryStatus;
    discovered: number;
    startedAt: string;
    finishedAt: string | null;
    errorMessage: string | null;
}

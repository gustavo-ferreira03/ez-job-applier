import { startWorker } from "./worker";
import type { AppContext } from "../context";
import type { DiscoverConfig } from "../types";
import type { DiscoveryJob } from "./types";

export async function startDiscovery(
    config: DiscoverConfig,
    ctx: AppContext,
): Promise<DiscoveryJob> {
    const running = await ctx.discoveryRepo.isRunning();
    if (running) throw new Error("A discovery is already running");

    const id = crypto.randomUUID();
    await ctx.discoveryRepo.create(id, config);

    startWorker(id, config, ctx);

    return {
        id,
        provider: config.provider,
        config,
        status: "running",
        discovered: 0,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        errorMessage: null,
    };
}

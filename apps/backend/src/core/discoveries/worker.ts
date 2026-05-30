import type { AppContext } from "../context";
import type { DiscoverConfig } from "../types";

const activeAborts = new Map<string, AbortController>();

export function startWorker(id: string, config: DiscoverConfig, ctx: AppContext): void {
    const abort = new AbortController();
    activeAborts.set(id, abort);
    run(id, config, ctx, abort.signal).finally(() => activeAborts.delete(id));
}

export function cancelWorker(id: string): boolean {
    const abort = activeAborts.get(id);
    if (!abort) return false;
    abort.abort();
    return true;
}

async function run(
    id: string,
    config: DiscoverConfig,
    ctx: AppContext,
    signal: AbortSignal,
): Promise<void> {
    try {
        const provider = ctx.providerRegistry.get(config.provider);
        const skipIds = await ctx.jobRepo.listIds(config.provider);
        const session = await provider.createSession();

        try {
            for await (const job of session.discoverJobs(config, skipIds)) {
                if (signal.aborted) break;
                await ctx.jobRepo.save(job);
                await ctx.discoveryRepo.incrementDiscovered(id);
            }
        } finally {
            await session.close();
        }

        const status = signal.aborted ? "cancelled" : "done";
        await ctx.discoveryRepo.finish(id, status);
    } catch (err) {
        await ctx.discoveryRepo.finish(
            id,
            "failed",
            err instanceof Error ? err.message : String(err),
        );
    }
}

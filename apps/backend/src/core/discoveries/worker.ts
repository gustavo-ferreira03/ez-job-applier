import { db } from "../../db/client";
import { discoveries } from "../../db/schema";
import { jobs as jobsTable } from "../../db/schema";
import { getProvider } from "../registry";
import { listJobIds, saveJob } from "../../repositories/jobs/services/storage";
import { eq, sql } from "drizzle-orm";
import type { DiscoverConfig } from "../types";

const activeAborts = new Map<string, AbortController>();

export function startWorker(id: string, config: DiscoverConfig): void {
    const abort = new AbortController();
    activeAborts.set(id, abort);
    run(id, config, abort.signal).finally(() => activeAborts.delete(id));
}

export function cancelWorker(id: string): boolean {
    const abort = activeAborts.get(id);
    if (!abort) return false;
    abort.abort();
    return true;
}

async function run(id: string, config: DiscoverConfig, signal: AbortSignal): Promise<void> {
    try {
        const provider = getProvider(config.provider);
        const skipIds = await listJobIds(config.provider);
        const session = await provider.createSession();

        try {
            for await (const job of session.discoverJobs(config, skipIds)) {
                if (signal.aborted) break;
                await saveJob(job);
                await db
                    .update(discoveries)
                    .set({ discovered: sql`${discoveries.discovered} + 1` })
                    .where(eq(discoveries.id, id));
            }
        } finally {
            await session.close();
        }

        const status = signal.aborted ? "cancelled" : "done";
        await db
            .update(discoveries)
            .set({ status, finishedAt: new Date().toISOString() })
            .where(eq(discoveries.id, id));
    } catch (err) {
        await db
            .update(discoveries)
            .set({
                status: "failed",
                finishedAt: new Date().toISOString(),
                errorMessage: err instanceof Error ? err.message : String(err),
            })
            .where(eq(discoveries.id, id));
    }
}

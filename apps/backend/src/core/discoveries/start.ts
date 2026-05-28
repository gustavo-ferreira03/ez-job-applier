import { db } from "../../db/client";
import { discoveries } from "../../db/schema";
import { eq } from "drizzle-orm";
import { startWorker } from "./worker";
import type { DiscoverConfig } from "../types";
import type { DiscoveryJob } from "./types";

export async function startDiscovery(
    config: DiscoverConfig,
): Promise<DiscoveryJob> {
    const running = await db
        .select()
        .from(discoveries)
        .where(eq(discoveries.status, "running"))
        .limit(1);

    if (running.length > 0) {
        throw new Error("A discovery is already running");
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.insert(discoveries).values({
        id,
        provider: config.provider,
        config: JSON.stringify(config),
        status: "running",
        discovered: 0,
        startedAt: now,
    });

    startWorker(id, config);

    return {
        id,
        provider: config.provider,
        config,
        status: "running",
        discovered: 0,
        startedAt: now,
        finishedAt: null,
        errorMessage: null,
    };
}

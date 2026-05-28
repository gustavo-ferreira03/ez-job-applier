import { db } from "../../db/client";
import { discoveries } from "../../db/schema";
import { eq, desc } from "drizzle-orm";
import type { DiscoveryJob } from "./types";

function toDiscoveryJob(row: typeof discoveries.$inferSelect): DiscoveryJob {
    return {
        id: row.id,
        provider: row.provider,
        config: JSON.parse(row.config),
        status: row.status as DiscoveryJob["status"],
        discovered: row.discovered,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt ?? null,
        errorMessage: row.errorMessage ?? null,
    };
}

export async function getDiscovery(id: string): Promise<DiscoveryJob | null> {
    const [row] = await db
        .select()
        .from(discoveries)
        .where(eq(discoveries.id, id))
        .limit(1);

    return row ? toDiscoveryJob(row) : null;
}

export async function listDiscoveries(): Promise<DiscoveryJob[]> {
    const rows = await db
        .select()
        .from(discoveries)
        .orderBy(desc(discoveries.startedAt));

    return rows.map(toDiscoveryJob);
}

import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { discoveries } from "../db/schema";
import type { IDiscoveryRepo } from "../core/ports";
import type { DiscoverConfig } from "../core/types";
import type { DiscoveryJob } from "../core/discoveries/types";

function toDiscoveryJob(row: typeof discoveries.$inferSelect): DiscoveryJob {
    return {
        id: row.id,
        provider: row.provider,
        config: JSON.parse(row.config) as DiscoverConfig,
        status: row.status as DiscoveryJob["status"],
        discovered: row.discovered,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt ?? null,
        errorMessage: row.errorMessage ?? null,
    };
}

export class DiscoveryRepository implements IDiscoveryRepo {
    constructor(private db: Db) {}

    async isRunning(): Promise<boolean> {
        const rows = await this.db
            .select()
            .from(discoveries)
            .where(eq(discoveries.status, "running"))
            .limit(1);
        return rows.length > 0;
    }

    async create(id: string, config: DiscoverConfig): Promise<void> {
        await this.db.insert(discoveries).values({
            id,
            provider: config.provider,
            config: JSON.stringify(config),
            status: "running",
            discovered: 0,
            startedAt: new Date().toISOString(),
        });
    }

    async incrementDiscovered(id: string): Promise<void> {
        await this.db
            .update(discoveries)
            .set({ discovered: sql`${discoveries.discovered} + 1` })
            .where(eq(discoveries.id, id));
    }

    async finish(id: string, status: DiscoveryJob["status"], errorMessage?: string): Promise<void> {
        await this.db
            .update(discoveries)
            .set({
                status,
                finishedAt: new Date().toISOString(),
                errorMessage: errorMessage ?? null,
            })
            .where(eq(discoveries.id, id));
    }

    async get(id: string): Promise<DiscoveryJob | null> {
        const [row] = await this.db
            .select()
            .from(discoveries)
            .where(eq(discoveries.id, id))
            .limit(1);
        return row ? toDiscoveryJob(row) : null;
    }

    async list(): Promise<DiscoveryJob[]> {
        const rows = await this.db
            .select()
            .from(discoveries)
            .orderBy(desc(discoveries.startedAt));
        return rows.map(toDiscoveryJob);
    }
}

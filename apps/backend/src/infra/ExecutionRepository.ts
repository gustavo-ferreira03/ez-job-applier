import { desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { executions } from "../db/schema";
import type { IExecutionRepo } from "../core/ports";
import type { DiscoverConfig } from "../core/types";
import type { Execution, ExecutionStatusValue } from "../core/discoveries/types";

function toExecution(row: typeof executions.$inferSelect): Execution {
    return {
        id: row.id,
        config: JSON.parse(row.config) as DiscoverConfig,
        status: row.status as ExecutionStatusValue,
        discovered: row.discovered,
        cycleMaxMs: row.cycleMaxMs,
        intervalMs: row.intervalMs,
        nextRunAt: row.nextRunAt ?? null,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt ?? null,
        errorMessage: row.errorMessage ?? null,
    };
}

export class ExecutionRepository implements IExecutionRepo {
    constructor(private db: Db) {}

    async create(id: string, config: DiscoverConfig, cycleMaxMs: number, intervalMs: number): Promise<void> {
        await this.db.insert(executions).values({
            id,
            config: JSON.stringify(config),
            status: "running",
            discovered: 0,
            cycleMaxMs,
            intervalMs,
            startedAt: new Date().toISOString(),
        });
    }

    async incrementDiscovered(id: string): Promise<void> {
        await this.db
            .update(executions)
            .set({ discovered: sql`${executions.discovered} + 1` })
            .where(eq(executions.id, id));
    }

    async setStatus(
        id: string,
        status: ExecutionStatusValue,
        nextRunAt?: string | null,
        errorMessage?: string,
    ): Promise<void> {
        const terminal = ["done", "failed", "cancelled"].includes(status);
        await this.db
            .update(executions)
            .set({
                status,
                ...(nextRunAt !== undefined ? { nextRunAt } : {}),
                ...(errorMessage !== undefined ? { errorMessage } : {}),
                ...(terminal ? { finishedAt: new Date().toISOString() } : {}),
            })
            .where(eq(executions.id, id));
    }

    async getActive(): Promise<Execution | null> {
        const [row] = await this.db
            .select()
            .from(executions)
            .where(inArray(executions.status, ["running", "waiting", "paused", "action_needed"]))
            .orderBy(desc(executions.startedAt))
            .limit(1);
        return row ? toExecution(row) : null;
    }

    async get(id: string): Promise<Execution | null> {
        const [row] = await this.db
            .select()
            .from(executions)
            .where(eq(executions.id, id))
            .limit(1);
        return row ? toExecution(row) : null;
    }

    async list(): Promise<Execution[]> {
        const rows = await this.db
            .select()
            .from(executions)
            .orderBy(desc(executions.startedAt));
        return rows.map(toExecution);
    }
}

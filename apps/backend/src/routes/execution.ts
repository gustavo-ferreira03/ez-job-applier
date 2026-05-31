import { OpenAPIHono } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import * as manager from "../core/execution/manager";
import type { AppContext } from "../core/context";
import type { DiscoverConfig } from "../core/types";

const StartBody = z.object({
    provider: z.string().default("linkedin"),
    keywords: z.string().optional(),
    location: z.string().optional(),
    workType: z.string().optional(),
    experienceLevel: z.array(z.string()).optional(),
    jobType: z.array(z.string()).optional(),
    datePosted: z.string().optional(),
    options: z.record(z.string(), z.unknown()).optional(),
    cycleMaxMs: z.number().int().positive().optional(),
    intervalMs: z.number().int().positive().optional(),
});

export function createExecutionRouter(ctx: AppContext): OpenAPIHono {
    const router = new OpenAPIHono();

    router.get("/execution", async (c) => {
        const ex = await ctx.executionRepo.getActive();
        if (!ex) return c.json({ active: false, running: false, paused: false, nextRunAt: null, cycleMaxMs: 3_600_000, intervalMs: 14_400_000, config: null });
        return c.json({
            active: true,
            running: ex.status === "running",
            paused: ex.status === "paused",
            nextRunAt: ex.nextRunAt,
            cycleMaxMs: ex.cycleMaxMs,
            intervalMs: ex.intervalMs,
            config: ex.config,
        });
    });

    router.get("/executions", async (c) => {
        const list = await ctx.executionRepo.list();
        return c.json({ executions: list });
    });

    router.post("/execution/start", async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const parsed = StartBody.safeParse(body);
        if (!parsed.success) throw new HTTPException(400, { message: "Invalid config" });

        const { cycleMaxMs, intervalMs, ...rest } = parsed.data;
        const config: DiscoverConfig = rest;

        try {
            await manager.startExecution(config, ctx, {
                cycleMaxMs: cycleMaxMs ?? undefined,
                intervalMs: intervalMs ?? undefined,
            });
        } catch (e) {
            throw new HTTPException(409, { message: e instanceof Error ? e.message : String(e) });
        }
        return c.json({ ok: true });
    });

    router.post("/execution/stop", async (c) => {
        await manager.stopExecution(ctx);
        return c.json({ ok: true });
    });

    router.post("/execution/pause", async (c) => {
        await manager.pauseExecution(ctx);
        return c.json({ ok: true });
    });

    router.post("/execution/resume", async (c) => {
        await manager.resumeExecution(ctx);
        return c.json({ ok: true });
    });

    return router;
}

import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import * as manager from "../core/execution/manager";
import type { AppContext } from "../core/context";
import { getSettings } from "../repositories/settings";

export function createExecutionRouter(ctx: AppContext): OpenAPIHono {
    const router = new OpenAPIHono();

    router.get("/execution", async (c) => {
        const ex = await ctx.executionRepo.getActive();
        if (!ex) {
            const settings = await getSettings();
            return c.json({ active: false, running: false, paused: false, actionNeeded: false, vncSessionId: null, nextRunAt: null, cycleMaxMs: settings.advanced.cycleMaxMs, intervalMs: settings.advanced.intervalMs, config: null });
        }
        return c.json({
            active: true,
            running: ex.status === "running",
            paused: ex.status === "paused",
            actionNeeded: ex.status === "action_needed",
            vncSessionId: manager.getExecutionVncSessionId(),
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
        const settings = await getSettings();
        const config = settings.general.execution;

        if (!config.keywords?.trim()) throw new HTTPException(400, { message: "Keywords are required" });
        if (!settings.general.defaultResume) throw new HTTPException(400, { message: "Default resume is required" });

        try {
            await manager.startExecution(config, ctx, {
                cycleMaxMs: settings.advanced.cycleMaxMs,
                intervalMs: settings.advanced.intervalMs,
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

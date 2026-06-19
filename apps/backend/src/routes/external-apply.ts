import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { AppContext } from "../core/context";
import { getExternalApplyStatus, sendUserMessage, stopExternalApply } from "../core/execution/external-apply/state";

export function createExternalApplyRouter(_ctx: AppContext): OpenAPIHono {
    const router = new OpenAPIHono();

    router.get("/external-apply", (c) => {
        return c.json(getExternalApplyStatus());
    });

    router.post("/external-apply/message", async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const jobId = Number(body?.jobId);
        const text = typeof body?.text === "string" ? body.text : "";
        if (!Number.isInteger(jobId)) throw new HTTPException(400, { message: "jobId is required" });
        if (!text.trim()) throw new HTTPException(400, { message: "text is required" });
        const ok = await sendUserMessage(jobId, text);
        if (!ok) throw new HTTPException(409, { message: "No active agent session" });
        return c.json({ ok: true });
    });

    router.post("/external-apply/stop", async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const jobId = Number(body?.jobId);
        if (!Number.isInteger(jobId)) throw new HTTPException(400, { message: "jobId is required" });
        const ok = stopExternalApply(jobId);
        if (!ok) throw new HTTPException(409, { message: "No active agent session" });
        return c.json({ ok: true });
    });

    return router;
}

import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { AppContext } from "../core/context";
import { decideApproval, getExternalApplyStatus } from "../core/execution/external-apply/state";

export function createExternalApplyRouter(_ctx: AppContext): OpenAPIHono {
    const router = new OpenAPIHono();

    router.get("/external-apply", (c) => {
        return c.json(getExternalApplyStatus());
    });

    router.post("/external-apply/decide", async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const decision = body?.decision;
        if (decision !== "approve" && decision !== "reject") {
            throw new HTTPException(400, { message: "decision must be 'approve' or 'reject'" });
        }
        const ok = decideApproval(decision);
        if (!ok) throw new HTTPException(409, { message: "No approval is currently pending" });
        return c.json({ ok: true });
    });

    return router;
}

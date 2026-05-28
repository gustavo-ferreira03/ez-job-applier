import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import { HTTPException } from "hono/http-exception";
import { runManager } from "./manager";
import { DiscoverBody } from "../router";

const router = new OpenAPIHono();

router.openapi(
    createRoute({
        method: "post",
        path: "/runs",
        tags: ["Runs"],
        summary: "Start an automated run: discover jobs then apply sequentially",
        request: {
            body: { content: { "application/json": { schema: DiscoverBody } }, required: true },
        },
        responses: {
            200: { description: "Run started" },
            409: { description: "A run is already in progress" },
        },
    }),
    async (c) => {
        const config = c.req.valid("json");
        try {
            const run = runManager.start(config);
            return c.json({ run });
        } catch (err) {
            throw new HTTPException(409, { message: err instanceof Error ? err.message : String(err) });
        }
    },
);

router.openapi(
    createRoute({
        method: "get",
        path: "/runs/current",
        tags: ["Runs"],
        summary: "Get the current run status and stats",
        responses: {
            200: { description: "Current run or null" },
        },
    }),
    async (c) => c.json({ run: runManager.getCurrent() }),
);

router.openapi(
    createRoute({
        method: "delete",
        path: "/runs/current",
        tags: ["Runs"],
        summary: "Cancel the current run",
        responses: {
            200: { description: "Cancelled" },
            404: { description: "No run in progress" },
        },
    }),
    async (c) => {
        const cancelled = runManager.cancel();
        if (!cancelled) throw new HTTPException(404, { message: "No run in progress" });
        return c.json({ ok: true });
    },
);

router.openapi(
    createRoute({
        method: "get",
        path: "/events",
        tags: ["Runs"],
        summary: "SSE stream of run events. Supports Last-Event-ID for replay on reconnect.",
        responses: {
            200: { description: "SSE stream — events: job_found | applying | result | done | cancelled | error" },
        },
    }),
    async (c) => {
        const lastIdHeader = c.req.header("Last-Event-ID");
        const lastId = lastIdHeader ? parseInt(lastIdHeader, 10) : 0;

        return streamSSE(c, async (s) => {
            // Replay buffered events since last seen ID
            for (const event of runManager.getEventsSince(lastId)) {
                await s.writeSSE({
                    id: String(event.id),
                    event: event.payload.type,
                    data: JSON.stringify(event.payload),
                });
            }

            // Stream live events
            await new Promise<void>((resolve) => {
                const unsubscribe = runManager.onEvent(async (event) => {
                    try {
                        await s.writeSSE({
                            id: String(event.id),
                            event: event.payload.type,
                            data: JSON.stringify(event.payload),
                        });
                    } catch {
                        unsubscribe();
                        resolve();
                    }
                });

                s.onAbort(() => {
                    unsubscribe();
                    resolve();
                });
            });
        });
    },
);

export default router;

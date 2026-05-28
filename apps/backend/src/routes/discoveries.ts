import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { startDiscovery } from "../core/discoveries/start";
import { getDiscovery, listDiscoveries } from "../core/discoveries/get";
import { cancelDiscovery } from "../core/discoveries/cancel";
import { initDb } from "../db/client";

const DiscoverBody = z
    .object({
        provider: z.string().openapi({ example: "linkedin" }),
        keywords: z.string().optional().openapi({ example: "backend engineer" }),
        location: z.string().optional().openapi({ example: "Brazil" }),
        workType: z.string().optional().openapi({
            example: "remote",
            description: "remote | hybrid | onsite",
        }),
        experienceLevel: z.array(z.string()).optional().openapi({
            example: ["mid_senior"],
            description: "entry | associate | mid_senior | director | executive",
        }),
        jobType: z.array(z.string()).optional().openapi({
            example: ["full_time"],
            description: "full_time | part_time | contract | temporary | internship",
        }),
        datePosted: z.string().optional().openapi({
            example: "week",
            description: "hour | hours6 | hours12 | day | week | month",
        }),
        maxJobs: z.number().int().positive().optional().openapi({ example: 50 }),
        options: z.record(z.string(), z.unknown()).optional().openapi({
            example: { easyApply: true },
            description: "Provider-specific options",
        }),
    })
    .openapi("DiscoverBody");

const DiscoveryIdParam = z.object({
    id: z.string().openapi({
        param: { name: "id", in: "path" },
        example: "550e8400-e29b-41d4-a716-446655440000",
    }),
});

const router = new OpenAPIHono();

router.openapi(
    createRoute({
        method: "post",
        path: "/discoveries",
        tags: ["Discoveries"],
        summary: "Start an async job discovery. Returns 202 immediately.",
        request: {
            body: {
                content: { "application/json": { schema: DiscoverBody } },
                required: true,
            },
        },
        responses: {
            202: { description: "Discovery started" },
            409: { description: "A discovery is already running" },
        },
    }),
    async (c) => {
        await initDb();
        const body = c.req.valid("json");
        try {
            const discovery = await startDiscovery(body);
            return c.json(discovery, 202);
        } catch (err) {
            throw new HTTPException(409, {
                message: err instanceof Error ? err.message : String(err),
            });
        }
    },
);

router.openapi(
    createRoute({
        method: "get",
        path: "/discoveries",
        tags: ["Discoveries"],
        summary: "List all past and current discoveries",
        responses: {
            200: { description: "List of discoveries" },
        },
    }),
    async (c) => {
        await initDb();
        const list = await listDiscoveries();
        return c.json({ discoveries: list });
    },
);

router.openapi(
    createRoute({
        method: "get",
        path: "/discoveries/{id}",
        tags: ["Discoveries"],
        summary: "Get the status of a discovery",
        request: { params: DiscoveryIdParam },
        responses: {
            200: { description: "Discovery status" },
            404: { description: "Not found" },
        },
    }),
    async (c) => {
        await initDb();
        const { id } = c.req.valid("param");
        const discovery = await getDiscovery(id);
        if (!discovery) throw new HTTPException(404, { message: "Discovery not found" });
        return c.json(discovery);
    },
);

router.openapi(
    createRoute({
        method: "delete",
        path: "/discoveries/{id}",
        tags: ["Discoveries"],
        summary: "Cancel a running discovery",
        request: { params: DiscoveryIdParam },
        responses: {
            200: { description: "Cancelled" },
            404: { description: "Not found or not running" },
        },
    }),
    async (c) => {
        await initDb();
        const { id } = c.req.valid("param");
        const cancelled = await cancelDiscovery(id);
        if (!cancelled) {
            throw new HTTPException(404, { message: "Discovery not found or not running" });
        }
        return c.json({ ok: true });
    },
);

export default router;

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { listJobs } from "../core/jobs/list";
import { getJob } from "../core/jobs/get";
import { addManualJob } from "../core/jobs/add-manual";
import type { AppContext } from "../core/context";

const JobIdParam = z.object({
    id: z.coerce.number().int().openapi({
        param: { name: "id", in: "path" },
        example: 1,
    }),
});

export function createJobsRouter(ctx: AppContext): OpenAPIHono {
    const router = new OpenAPIHono();

    router.openapi(
        createRoute({
            method: "get",
            path: "/jobs",
            tags: ["Jobs"],
            summary: "List all discovered jobs with their application status",
            responses: {
                200: { description: "List of jobs" },
            },
        }),
        async (c) => {
            const result = await listJobs(ctx);
            return c.json({ jobs: result });
        },
    );

    router.openapi(
        createRoute({
            method: "get",
            path: "/jobs/{id}",
            tags: ["Jobs"],
            summary: "Get a job with its application status and questions",
            request: { params: JobIdParam },
            responses: {
                200: { description: "Job detail with questions" },
                404: { description: "Job not found" },
            },
        }),
        async (c) => {
            const { id } = c.req.valid("param");
            const job = await getJob(id, ctx);
            if (!job) throw new HTTPException(404, { message: "Job not found" });
            return c.json(job);
        },
    );

    router.post("/jobs", async (c) => {
        const body = await c.req.json().catch(() => null);
        const url = body && typeof body.url === "string" ? body.url : "";
        if (!url.trim()) throw new HTTPException(400, { message: "url is required" });
        try {
            const result = await addManualJob(url, ctx);
            return c.json(result);
        } catch (e) {
            throw new HTTPException(400, { message: e instanceof Error ? e.message : String(e) });
        }
    });

    return router;
}

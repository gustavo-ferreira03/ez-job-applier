import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { initDb } from "../db/client";
import { listJobs } from "../core/jobs/list";
import { getJob } from "../core/jobs/get";

const JobIdParam = z.object({
    id: z.coerce.number().int().openapi({
        param: { name: "id", in: "path" },
        example: 1,
    }),
});

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
        await initDb();
        const result = await listJobs();
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
        await initDb();
        const { id } = c.req.valid("param");
        const job = await getJob(id);
        if (!job) throw new HTTPException(404, { message: "Job not found" });
        return c.json(job);
    },
);

export default router;

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { HTTPException } from "hono/http-exception";
import { listJobs, getJob } from "../repositories/jobs/services/storage";
import {
    getApplication,
    getQuestions,
} from "../repositories/applications/services/storage";
import { discoverJobs } from "./usecases/discoverJobs";
import { getQuestions as getQuestionsUseCase } from "./usecases/getQuestions";
import { applyToJob } from "./usecases/applyToJob";
import type { DiscoverConfig } from "./types";

const router = new Hono();

router.get("/jobs", async (c) => {
    return c.json({ jobs: await listJobs() });
});

router.get("/jobs/:jobId", async (c) => {
    const job = await getJob(c.req.param("jobId"));
    if (!job) throw new HTTPException(404, { message: "Vaga não encontrada" });

    const application = await getApplication(job.provider, job.jobId);
    const questions = application ? await getQuestions(application.id) : [];

    return c.json({ job, application, questions });
});

/**
 * POST /discover
 * Body: DiscoverConfig
 * Streams discovered jobs as SSE events.
 */
router.post("/discover", async (c) => {
    const body = await c.req.json<DiscoverConfig>();
    if (!body.provider) throw new HTTPException(400, { message: "Campo 'provider' é obrigatório" });

    return streamSSE(c, async (s) => {
        try {
            for await (const job of discoverJobs(body)) {
                await s.writeSSE({ event: "job", data: JSON.stringify(job) });
            }
            await s.writeSSE({ event: "done", data: "" });
        } catch (err) {
            await s.writeSSE({
                event: "error",
                data: err instanceof Error ? err.message : String(err),
            });
        }
    });
});

/**
 * GET /jobs/:jobId/questions
 * Opens the application form and returns the questions without submitting.
 */
router.get("/jobs/:jobId/questions", async (c) => {
    const result = await getQuestionsUseCase(c.req.param("jobId"));
    return c.json(result);
});

/**
 * POST /jobs/:jobId/apply
 * Body: { answers?: Record<string, string>, resumeFilename?: string }
 * Fills the form with the given answers and submits the application.
 */
router.post("/jobs/:jobId/apply", async (c) => {
    type Body = { answers?: Record<string, string>; resumeFilename?: string };
    const body: Body = await c.req.json<Body>().catch(() => ({}));

    const result = await applyToJob(
        c.req.param("jobId"),
        body.answers ?? {},
        body.resumeFilename,
    );
    return c.json(result);
});

export default router;

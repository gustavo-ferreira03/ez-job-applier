import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import { listJobs, getJob } from "../repositories/jobs/services/storage";
import {
    getApplication,
    getQuestions,
    upsertApplication,
    answerQuestions,
} from "../repositories/applications/services/storage";
import { discoverJobs } from "./usecases/discoverJobs";
import { getQuestions as getQuestionsUseCase } from "./usecases/getQuestions";
import { applyToJob } from "./usecases/applyToJob";
import type { DiscoverConfig } from "./types";

const router = new Hono();

router.get(
    "/jobs",
    describeRoute({ tags: ["Jobs"], description: "List all discovered jobs" }),
    async (c) => c.json({ jobs: await listJobs() }),
);

router.get(
    "/jobs/:jobId",
    describeRoute({ tags: ["Jobs"], description: "Get a job with its application and questions" }),
    async (c) => {
        const job = await getJob(c.req.param("jobId"));
        if (!job) throw new HTTPException(404, { message: "Vaga não encontrada" });
        const application = await getApplication(job.provider, job.jobId);
        const questions = application ? await getQuestions(application.id) : [];
        return c.json({ job, application, questions });
    },
);

router.post(
    "/discover",
    describeRoute({
        tags: ["Jobs"],
        description: "Discover jobs via a provider and stream results as SSE. Body: DiscoverConfig",
    }),
    async (c) => {
        const body = await c.req.json<DiscoverConfig>();
        if (!body.provider)
            throw new HTTPException(400, { message: "Campo 'provider' é obrigatório" });

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
    },
);

router.get(
    "/jobs/:jobId/questions",
    describeRoute({
        tags: ["Applications"],
        description: "Open the application form and return questions without submitting",
    }),
    async (c) => {
        const result = await getQuestionsUseCase(c.req.param("jobId"));
        return c.json(result);
    },
);

router.post(
    "/jobs/:jobId/apply",
    describeRoute({
        tags: ["Applications"],
        description: "Fill the application form with answers and submit. Body: { answers?, resumeFilename? }",
    }),
    async (c) => {
        type Body = { answers?: Record<string, string>; resumeFilename?: string };
        const body: Body = await c.req.json<Body>().catch(() => ({}));
        const result = await applyToJob(
            c.req.param("jobId"),
            body.answers ?? {},
            body.resumeFilename,
        );
        return c.json(result);
    },
);

router.post(
    "/jobs/:jobId/answers",
    describeRoute({
        tags: ["Applications"],
        description: "Save answers for pending questions without re-opening the form. Body: { answers }",
    }),
    async (c) => {
        const job = await getJob(c.req.param("jobId"));
        if (!job) throw new HTTPException(404, { message: "Vaga não encontrada" });

        const body = await c.req.json<{ answers: Record<string, string> }>();
        if (!body.answers || typeof body.answers !== "object")
            throw new HTTPException(400, { message: "Campo 'answers' é obrigatório" });

        const application = await getApplication(job.provider, job.jobId);
        if (!application)
            throw new HTTPException(404, {
                message: "Candidatura não encontrada. Chame GET /jobs/:id/questions primeiro.",
            });

        await answerQuestions(application.id, body.answers);
        const questions = await getQuestions(application.id);
        return c.json({ application, questions });
    },
);

router.post(
    "/jobs/:jobId/skip",
    describeRoute({ tags: ["Applications"], description: "Mark a job application as skipped" }),
    async (c) => {
        const job = await getJob(c.req.param("jobId"));
        if (!job) throw new HTTPException(404, { message: "Vaga não encontrada" });
        const application = await upsertApplication(job.provider, job.jobId, "SKIPPED");
        return c.json({ application });
    },
);

router.post(
    "/jobs/:jobId/mark-applied",
    describeRoute({
        tags: ["Applications"],
        description: "Manually mark a job as applied without going through the automated flow",
    }),
    async (c) => {
        const job = await getJob(c.req.param("jobId"));
        if (!job) throw new HTTPException(404, { message: "Vaga não encontrada" });
        const application = await upsertApplication(job.provider, job.jobId, "SUBMITTED");
        return c.json({ application });
    },
);

export default router;

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import { HTTPException } from "hono/http-exception";
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

const JobIdParam = z.object({
    jobId: z.string().openapi({
        param: { name: "jobId", in: "path" },
        example: "4150055859",
    }),
});

const DiscoverBody = z
    .object({
        provider: z.string().openapi({ example: "linkedin" }),
        keywords: z
            .string()
            .optional()
            .openapi({ example: "backend engineer" }),
        location: z.string().optional().openapi({ example: "Brazil" }),
        workType: z.string().optional().openapi({
            example: "remote",
            description: "remote | hybrid | onsite",
        }),
        experienceLevel: z
            .array(z.string())
            .optional()
            .openapi({
                example: ["mid_senior"],
                description:
                    "entry | associate | mid_senior | director | executive",
            }),
        jobType: z
            .array(z.string())
            .optional()
            .openapi({
                example: ["full_time"],
                description:
                    "full_time | part_time | contract | temporary | internship",
            }),
        datePosted: z.string().optional().openapi({
            example: "week",
            description: "hour | hours6 | hours12 | day | week | month",
        }),
        maxJobs: z
            .number()
            .int()
            .positive()
            .optional()
            .openapi({ example: 10 }),
        options: z
            .record(z.string(), z.unknown())
            .optional()
            .openapi({
                example: { easyApply: true },
                description: "Provider-specific options",
            }),
    })
    .openapi("DiscoverConfig");

const ApplyBody = z
    .object({
        answers: z
            .record(z.string(), z.string())
            .optional()
            .openapi({ example: { "Years of experience": "3" } }),
        resumeFilename: z
            .string()
            .optional()
            .openapi({ example: "meu-cv.pdf" }),
    })
    .openapi("ApplyBody");

const AnswersBody = z
    .object({
        answers: z.record(z.string(), z.string()).openapi({
            example: {
                "Years of experience": "3",
                "Work authorization": "Yes",
            },
        }),
    })
    .openapi("AnswersBody");

// ─── Routes ─────────────────────────────────────────────────────────────────

const router = new OpenAPIHono();

router.openapi(
    createRoute({
        method: "get",
        path: "/jobs",
        tags: ["Jobs"],
        summary: "List all discovered jobs",
        responses: { 200: { description: "List of jobs" } },
    }),
    async (c) => c.json({ jobs: await listJobs() }),
);

router.openapi(
    createRoute({
        method: "get",
        path: "/jobs/{jobId}",
        tags: ["Jobs"],
        summary: "Get a job with its application and questions",
        request: { params: JobIdParam },
        responses: {
            200: { description: "Job with application and questions" },
            404: { description: "Job not found" },
        },
    }),
    async (c) => {
        const { jobId } = c.req.valid("param");
        const job = await getJob(jobId);
        if (!job)
            throw new HTTPException(404, { message: "Vaga não encontrada" });
        const application = await getApplication(job.provider, job.jobId);
        const questions = application ? await getQuestions(application.id) : [];
        return c.json({ job, application, questions });
    },
);

router.openapi(
    createRoute({
        method: "post",
        path: "/discover",
        tags: ["Jobs"],
        summary: "Discover jobs and stream results as SSE",
        request: {
            body: {
                content: { "application/json": { schema: DiscoverBody } },
                required: true,
            },
        },
        responses: {
            200: { description: "SSE stream — events: job | done | error" },
        },
    }),
    async (c) => {
        const body = c.req.valid("json");
        return streamSSE(c, async (s) => {
            try {
                for await (const job of discoverJobs(body)) {
                    await s.writeSSE({
                        event: "job",
                        data: JSON.stringify(job),
                    });
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

router.openapi(
    createRoute({
        method: "get",
        path: "/jobs/{jobId}/questions",
        tags: ["Applications"],
        summary:
            "Open the application form and return questions without submitting",
        request: { params: JobIdParam },
        responses: {
            200: { description: "ApplyResult with list of questions" },
        },
    }),
    async (c) => {
        const result = await getQuestionsUseCase(c.req.valid("param").jobId);
        return c.json(result);
    },
);

router.openapi(
    createRoute({
        method: "post",
        path: "/jobs/{jobId}/apply",
        tags: ["Applications"],
        summary: "Fill the application form with answers and submit",
        request: {
            params: JobIdParam,
            body: { content: { "application/json": { schema: ApplyBody } } },
        },
        responses: { 200: { description: "ApplyResult" } },
    }),
    async (c) => {
        const { jobId } = c.req.valid("param");
        const body = c.req.valid("json");
        const result = await applyToJob(
            jobId,
            body.answers ?? {},
            body.resumeFilename,
        );
        return c.json(result);
    },
);

router.openapi(
    createRoute({
        method: "post",
        path: "/jobs/{jobId}/answers",
        tags: ["Applications"],
        summary:
            "Save answers for pending questions without re-opening the form",
        request: {
            params: JobIdParam,
            body: {
                content: { "application/json": { schema: AnswersBody } },
                required: true,
            },
        },
        responses: {
            200: { description: "Updated application and questions" },
            404: { description: "Job or application not found" },
        },
    }),
    async (c) => {
        const { jobId } = c.req.valid("param");
        const { answers } = c.req.valid("json");
        const job = await getJob(jobId);
        if (!job)
            throw new HTTPException(404, { message: "Vaga não encontrada" });
        const application = await getApplication(job.provider, job.jobId);
        if (!application)
            throw new HTTPException(404, {
                message:
                    "Candidatura não encontrada. Chame GET /jobs/:id/questions primeiro.",
            });
        await answerQuestions(application.id, answers);
        const questions = await getQuestions(application.id);
        return c.json({ application, questions });
    },
);

router.openapi(
    createRoute({
        method: "post",
        path: "/jobs/{jobId}/skip",
        tags: ["Applications"],
        summary: "Mark a job application as skipped",
        request: { params: JobIdParam },
        responses: {
            200: { description: "Updated application" },
            404: { description: "Job not found" },
        },
    }),
    async (c) => {
        const { jobId } = c.req.valid("param");
        const job = await getJob(jobId);
        if (!job)
            throw new HTTPException(404, { message: "Vaga não encontrada" });
        const application = await upsertApplication(
            job.provider,
            job.jobId,
            "SKIPPED",
        );
        return c.json({ application });
    },
);

router.openapi(
    createRoute({
        method: "post",
        path: "/jobs/{jobId}/mark-applied",
        tags: ["Applications"],
        summary: "Manually mark a job as applied without the automated flow",
        request: { params: JobIdParam },
        responses: {
            200: { description: "Updated application" },
            404: { description: "Job not found" },
        },
    }),
    async (c) => {
        const { jobId } = c.req.valid("param");
        const job = await getJob(jobId);
        if (!job)
            throw new HTTPException(404, { message: "Vaga não encontrada" });
        const application = await upsertApplication(
            job.provider,
            job.jobId,
            "SUBMITTED",
        );
        return c.json({ application });
    },
);

export default router;

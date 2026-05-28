import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import { HTTPException } from "hono/http-exception";
import { desc, eq, inArray } from "drizzle-orm";
import { db, initDb } from "../db/client";
import { jobs, applications, applicationQuestions } from "../db/schema";
import { getJob } from "../repositories/jobs/services/storage";
import {
    getApplication,
    upsertApplication,
    answerQuestions,
} from "../repositories/applications/services/storage";
import { discoverJobs } from "../core/usecases/discoverJobs";
import { applyToJob } from "../core/usecases/applyToJob";

function parseList(value: string | null): string[] {
    if (!value) return [];
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed)
            ? parsed.filter((item): item is string => typeof item === "string")
            : [];
    } catch {
        return [];
    }
}

const JobIdParam = z.object({
    jobId: z.string().openapi({
        param: { name: "jobId", in: "path" },
        example: "4150055859",
    }),
});

export const DiscoverBody = z
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
        summary: "List all jobs with their application status",
        responses: { 200: { description: "List of job summaries" } },
    }),
    async (c) => {
        await initDb();

        const rows = await db
            .select({ job: jobs, application: applications })
            .from(jobs)
            .leftJoin(applications, eq(applications.jobId, jobs.id))
            .orderBy(desc(jobs.updatedAt));

        const appIds = rows
            .filter((r) => r.application !== null)
            .map((r) => r.application!.id);

        const unansweredMap = new Map<number, number>();
        if (appIds.length > 0) {
            const qRows = await db
                .select({
                    applicationId: applicationQuestions.applicationId,
                    answer: applicationQuestions.answer,
                })
                .from(applicationQuestions)
                .where(inArray(applicationQuestions.applicationId, appIds));

            for (const qr of qRows) {
                if (qr.answer === null) {
                    unansweredMap.set(
                        qr.applicationId,
                        (unansweredMap.get(qr.applicationId) ?? 0) + 1,
                    );
                }
            }
        }

        const jobSummaries = rows.map(({ job, application }) => ({
            id: job.id,
            job_id: job.externalId,
            title: job.title,
            company: job.company,
            location: job.location,
            url: job.url,
            easy_apply: false,
            preferences: parseList(job.preferences),
            skills: parseList(job.skills),
            about: job.about,
            application_url: job.applicationUrl,
            application_id: application?.id ?? null,
            status: application?.status ?? "FOUND",
            submit_approved: false,
            cv_filename: application?.resumeFilename ?? null,
            error_message: application?.errorMessage ?? null,
            created_at: job.createdAt,
            updated_at: job.updatedAt,
            application_updated_at: application?.updatedAt ?? null,
            unanswered_count: application
                ? (unansweredMap.get(application.id) ?? 0)
                : 0,
        }));

        return c.json({ jobs: jobSummaries });
    },
);

router.openapi(
    createRoute({
        method: "get",
        path: "/jobs/{jobId}",
        tags: ["Jobs"],
        summary: "Get a job with its application status and questions",
        request: { params: JobIdParam },
        responses: {
            200: { description: "Job detail" },
            404: { description: "Job not found" },
        },
    }),
    async (c) => {
        await initDb();
        const { jobId } = c.req.valid("param");

        const [jobRow] = await db
            .select({ job: jobs, application: applications })
            .from(jobs)
            .leftJoin(applications, eq(applications.jobId, jobs.id))
            .where(eq(jobs.externalId, jobId))
            .limit(1);

        if (!jobRow) throw new HTTPException(404, { message: "Vaga não encontrada" });

        const { job, application } = jobRow;

        const questionRows = application
            ? await db
                  .select()
                  .from(applicationQuestions)
                  .where(eq(applicationQuestions.applicationId, application.id))
            : [];

        const unansweredCount = questionRows.filter((q) => q.answer === null).length;

        return c.json({
            id: job.id,
            job_id: job.externalId,
            title: job.title,
            company: job.company,
            location: job.location,
            url: job.url,
            easy_apply: false,
            preferences: parseList(job.preferences),
            skills: parseList(job.skills),
            about: job.about,
            application_url: job.applicationUrl,
            application_id: application?.id ?? null,
            status: application?.status ?? "FOUND",
            submit_approved: false,
            cv_filename: application?.resumeFilename ?? null,
            error_message: application?.errorMessage ?? null,
            created_at: job.createdAt,
            updated_at: job.updatedAt,
            application_updated_at: application?.updatedAt ?? null,
            unanswered_count: unansweredCount,
            questions: questionRows.map((q) => ({
                id: q.id,
                application_id: q.applicationId,
                label: q.label,
                answer: q.answer ?? null,
                field_type: q.fieldType ?? null,
                options: parseList(q.options),
            })),
        });
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
        return c.json({ ok: true });
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
        await upsertApplication(job.provider, job.jobId, "SKIPPED");
        return c.json({ ok: true });
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
        await upsertApplication(job.provider, job.jobId, "SUBMITTED");
        return c.json({ ok: true });
    },
);

export default router;

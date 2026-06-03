import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getQuestions } from "../core/applications/get-questions";
import { saveAnswers } from "../core/applications/answer";
import { applyToJob } from "../core/applications/apply";
import { rejectJob, rejectJobsByStatus, reprocessJob } from "../core/applications/reject";
import { APPLICATION_STATUSES } from "../core/types";
import type { AppContext } from "../core/context";

const JobIdParam = z.object({
    id: z.coerce.number().int().openapi({
        param: { name: "id", in: "path" },
        example: 1,
    }),
});

const AnswersBody = z
    .object({
        answers: z.record(z.string(), z.string()).openapi({
            example: { "Years of experience": "3", "Work authorization": "Yes" },
        }),
    })
    .openapi("AnswersBody");

const ApplyBody = z
    .object({
        answers: z.record(z.string(), z.string()).optional().openapi({
            example: { "Years of experience": "3" },
        }),
        resumeFilename: z.string().optional(),
    })
    .openapi("ApplyBody");

const RejectJobsBody = z
    .object({
        statuses: z.array(z.enum(APPLICATION_STATUSES)).openapi({
            example: ["FOUND", "NEEDS_INPUT"],
        }),
    })
    .openapi("RejectJobsBody");

export function createApplicationsRouter(ctx: AppContext): OpenAPIHono {
    const router = new OpenAPIHono();

    router.openapi(
        createRoute({
            method: "post",
            path: "/jobs/{id}/questions",
            tags: ["Applications"],
            summary: "Open the application form and extract questions",
            request: { params: JobIdParam },
            responses: {
                200: { description: "Questions extracted" },
                404: { description: "Job not found" },
            },
        }),
        async (c) => {
            const { id } = c.req.valid("param");
            try {
                const result = await getQuestions(id, ctx);
                return c.json(result);
            } catch (err) {
                if (err instanceof Error && err.message.includes("not found")) {
                    throw new HTTPException(404, { message: err.message });
                }
                throw err;
            }
        },
    );

    router.openapi(
        createRoute({
            method: "post",
            path: "/jobs/{id}/answers",
            tags: ["Applications"],
            summary: "Save answers without re-opening the form",
            request: {
                params: JobIdParam,
                body: { content: { "application/json": { schema: AnswersBody } }, required: true },
            },
            responses: {
                200: { description: "Answers saved" },
                404: { description: "Job or application not found" },
            },
        }),
        async (c) => {
            const { id } = c.req.valid("param");
            const { answers } = c.req.valid("json");
            try {
                await saveAnswers(id, answers, ctx);
                return c.json({ ok: true });
            } catch (err) {
                if (err instanceof Error && err.message.includes("not found")) {
                    throw new HTTPException(404, { message: err.message });
                }
                throw err;
            }
        },
    );

    router.openapi(
        createRoute({
            method: "post",
            path: "/jobs/{id}/apply",
            tags: ["Applications"],
            summary: "Submit the application with saved answers",
            request: {
                params: JobIdParam,
                body: { content: { "application/json": { schema: ApplyBody } } },
            },
            responses: {
                200: { description: "Application result" },
                400: { description: "Application has unanswered questions" },
                404: { description: "Job not found" },
            },
        }),
        async (c) => {
            const { id } = c.req.valid("param");
            const body = c.req.valid("json");
            try {
                await applyToJob(id, body?.answers ?? {}, ctx, body?.resumeFilename);
                return c.json({ ok: true });
            } catch (err) {
                if (err instanceof Error && err.message.includes("must be answered")) {
                    throw new HTTPException(400, { message: err.message });
                }
                if (err instanceof Error && err.message.includes("not found")) {
                    throw new HTTPException(404, { message: err.message });
                }
                throw err;
            }
        },
    );

    router.openapi(
        createRoute({
            method: "post",
            path: "/jobs/reject",
            tags: ["Applications"],
            summary: "Reject jobs by status",
            request: {
                body: { content: { "application/json": { schema: RejectJobsBody } }, required: true },
            },
            responses: {
                200: { description: "Jobs rejected" },
            },
        }),
        async (c) => {
            const { statuses } = c.req.valid("json");
            const rejected = await rejectJobsByStatus(statuses, ctx);
            return c.json({ rejected });
        },
    );

    router.openapi(
        createRoute({
            method: "post",
            path: "/jobs/{id}/reject",
            tags: ["Applications"],
            summary: "Mark a job as rejected",
            request: { params: JobIdParam },
            responses: {
                200: { description: "Job rejected" },
                400: { description: "Job cannot be rejected" },
                404: { description: "Job not found" },
            },
        }),
        async (c) => {
            const { id } = c.req.valid("param");
            try {
                await rejectJob(id, ctx);
                return c.json({ ok: true });
            } catch (err) {
                if (err instanceof Error && err.message.includes("not found")) {
                    throw new HTTPException(404, { message: err.message });
                }
                if (err instanceof Error && (err.message.includes("processing") || err.message.includes("cannot"))) {
                    throw new HTTPException(400, { message: err.message });
                }
                throw err;
            }
        },
    );

    router.openapi(
        createRoute({
            method: "post",
            path: "/jobs/{id}/reprocess",
            tags: ["Applications"],
            summary: "Move a failed job back to found",
            request: { params: JobIdParam },
            responses: {
                200: { description: "Job moved back to found" },
                400: { description: "Job cannot be reprocessed" },
                404: { description: "Job not found" },
            },
        }),
        async (c) => {
            const { id } = c.req.valid("param");
            try {
                await reprocessJob(id, ctx);
                return c.json({ ok: true });
            } catch (err) {
                if (err instanceof Error && err.message.includes("not found")) {
                    throw new HTTPException(404, { message: err.message });
                }
                if (err instanceof Error && (err.message.includes("processing") || err.message.includes("not failed"))) {
                    throw new HTTPException(400, { message: err.message });
                }
                throw err;
            }
        },
    );

    return router;
}

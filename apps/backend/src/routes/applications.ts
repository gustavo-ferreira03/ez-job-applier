import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { saveAnswers } from "../core/applications/answer";
import { applyToJob } from "../core/applications/apply";
import { rejectJob, rejectJobsByIds, reprocessJob } from "../core/applications/reject";
import { wakeExecution } from "../core/execution/manager";
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

const JobIdsBody = z
    .object({
        ids: z.array(z.number().int()).openapi({
            example: [1, 2, 3],
        }),
    })
    .openapi("JobIdsBody");

export function createApplicationsRouter(ctx: AppContext): OpenAPIHono {
    const router = new OpenAPIHono();

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
            path: "/jobs/approve",
            tags: ["Applications"],
            summary: "Approve the given ready-for-review jobs",
            request: {
                body: { content: { "application/json": { schema: JobIdsBody } }, required: true },
            },
            responses: { 200: { description: "Jobs approved" } },
        }),
        async (c) => {
            const { ids } = c.req.valid("json");
            const approved = await ctx.appRepo.approveByIds(ids);
            if (approved > 0) wakeExecution();
            return c.json({ approved });
        },
    );

    router.openapi(
        createRoute({
            method: "post",
            path: "/jobs/reject",
            tags: ["Applications"],
            summary: "Reject the given jobs",
            request: {
                body: { content: { "application/json": { schema: JobIdsBody } }, required: true },
            },
            responses: {
                200: { description: "Jobs rejected" },
            },
        }),
        async (c) => {
            const { ids } = c.req.valid("json");
            const rejected = await rejectJobsByIds(ids, ctx);
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

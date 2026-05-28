import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { initDb } from "../db/client";
import { getQuestions } from "../core/applications/get-questions";
import { saveAnswers } from "../core/applications/answer";
import { applyToJob } from "../core/applications/apply";
import { skipJob } from "../core/applications/skip";

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
        resumeFilename: z.string().optional().openapi({ example: "meu-cv.pdf" }),
    })
    .openapi("ApplyBody");

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
        await initDb();
        const { id } = c.req.valid("param");
        try {
            const result = await getQuestions(id);
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
        await initDb();
        const { id } = c.req.valid("param");
        const { answers } = c.req.valid("json");
        try {
            await saveAnswers(id, answers);
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
            404: { description: "Job not found" },
        },
    }),
    async (c) => {
        await initDb();
        const { id } = c.req.valid("param");
        const body = c.req.valid("json");
        try {
            const result = await applyToJob(id, body?.answers ?? {}, body?.resumeFilename);
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
        path: "/jobs/{id}/skip",
        tags: ["Applications"],
        summary: "Mark a job as skipped",
        request: { params: JobIdParam },
        responses: {
            200: { description: "Job skipped" },
            404: { description: "Job not found" },
        },
    }),
    async (c) => {
        await initDb();
        const { id } = c.req.valid("param");
        try {
            await skipJob(id);
            return c.json({ ok: true });
        } catch (err) {
            if (err instanceof Error && err.message.includes("not found")) {
                throw new HTTPException(404, { message: err.message });
            }
            throw err;
        }
    },
);

export default router;

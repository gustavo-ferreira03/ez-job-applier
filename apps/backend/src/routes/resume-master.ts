import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { parseResume, ResumeValidationError } from "resume-ci";
import { extractMasterFromResume } from "../core/resumes/extract";
import { tailorResume } from "../core/resumes/tailor";
import { isTailoring, runTailoring } from "../core/resumes/tailor-status";
import { generateResumePdf, resumeOutputName } from "../core/resumes/pdf";
import { getSettings } from "../repositories/settings";
import type { AppContext } from "../core/context";

const JobIdParam = z.object({
    id: z.coerce.number().int().openapi({ param: { name: "id", in: "path" }, example: 1 }),
});

const NameParam = z.object({
    name: z.string().openapi({ param: { name: "name", in: "path" }, example: "default" }),
});

const MasterBody = z.object({ yaml: z.string() }).openapi("ResumeMasterBody");

const ExtractBody = z
    .object({ resumeFilename: z.string().optional() })
    .openapi("ResumeMasterExtractBody");

const TailorBody = z.object({ master: z.string().optional() }).openapi("TailorBody");

export function createResumeMasterRouter(ctx: AppContext): OpenAPIHono {
    const router = new OpenAPIHono();

    router.openapi(
        createRoute({
            method: "get",
            path: "/resume/masters",
            tags: ["Resume Master"],
            summary: "List master resume names",
            responses: { 200: { description: "Master names" } },
        }),
        async (c) => {
            const masters = await ctx.resumeMasterRepo.listMasters();
            return c.json({ masters });
        },
    );

    router.openapi(
        createRoute({
            method: "get",
            path: "/resume/masters/{name}",
            tags: ["Resume Master"],
            summary: "Get a master resume (YAML)",
            request: { params: NameParam },
            responses: {
                200: { description: "Master YAML, or null when none exists" },
            },
        }),
        async (c) => {
            const { name } = c.req.valid("param");
            const yaml = await ctx.resumeMasterRepo.readMaster(name);
            return c.json({ yaml });
        },
    );

    router.openapi(
        createRoute({
            method: "put",
            path: "/resume/masters/{name}",
            tags: ["Resume Master"],
            summary: "Save a master resume (validated against resume-ci)",
            request: {
                params: NameParam,
                body: { content: { "application/json": { schema: MasterBody } }, required: true },
            },
            responses: {
                200: { description: "Saved" },
                400: { description: "Invalid resume YAML" },
            },
        }),
        async (c) => {
            const { name } = c.req.valid("param");
            const { yaml } = c.req.valid("json");
            try {
                parseResume(yaml, { inputFormat: "yaml" });
            } catch (err) {
                if (err instanceof ResumeValidationError) {
                    return c.json({ error: "Invalid resume", issues: err.issues }, 400);
                }
                throw err;
            }
            await ctx.resumeMasterRepo.writeMaster(name, yaml);
            return c.json({ ok: true });
        },
    );

    router.openapi(
        createRoute({
            method: "delete",
            path: "/resume/masters/{name}",
            tags: ["Resume Master"],
            summary: "Delete a master resume",
            request: { params: NameParam },
            responses: { 200: { description: "Deleted" } },
        }),
        async (c) => {
            const { name } = c.req.valid("param");
            await ctx.resumeMasterRepo.deleteMaster(name);
            return c.json({ ok: true });
        },
    );

    router.openapi(
        createRoute({
            method: "post",
            path: "/resume/masters/{name}/extract",
            tags: ["Resume Master"],
            summary: "Generate a master resume from an uploaded PDF via the LLM",
            request: {
                params: NameParam,
                body: { content: { "application/json": { schema: ExtractBody } } },
            },
            responses: {
                200: { description: "Draft master YAML" },
                400: { description: "No resume PDF available" },
            },
        }),
        async (c) => {
            const { name } = c.req.valid("param");
            const body = c.req.valid("json");
            try {
                const yaml = await extractMasterFromResume(name, body?.resumeFilename, ctx);
                return c.json({ yaml });
            } catch (err) {
                if (err instanceof Error && err.message.includes("No resume PDF")) {
                    throw new HTTPException(400, { message: err.message });
                }
                throw err;
            }
        },
    );

    router.openapi(
        createRoute({
            method: "post",
            path: "/jobs/{id}/tailor",
            tags: ["Resume Master"],
            summary: "Tailor a master resume to a job (auto-selects a master unless one is given)",
            request: {
                params: JobIdParam,
                body: { content: { "application/json": { schema: TailorBody } } },
            },
            responses: {
                200: { description: "Tailored; returns the master used" },
                400: { description: "No master resume" },
                404: { description: "Job not found" },
            },
        }),
        async (c) => {
            const { id } = c.req.valid("param");
            const body = c.req.valid("json");
            try {
                const settings = await getSettings();
                // Joins an in-flight run instead of starting a duplicate, so repeated clicks
                // (or a manual tailor racing the auto-tailor) only ever produce one run.
                const alreadyRunning = isTailoring(id);
                const { master } = await runTailoring(id, () =>
                    tailorResume(
                        id,
                        ctx,
                        body?.master,
                        settings.llm.resumeTailoringInstructions,
                        settings.llm.resumeTailoringFlexibility,
                    ),
                );
                return c.json({ ok: true, master, deduped: alreadyRunning });
            } catch (err) {
                if (err instanceof Error && err.message.includes("No master")) {
                    throw new HTTPException(400, { message: err.message });
                }
                if (err instanceof Error && err.message.includes("not found")) {
                    throw new HTTPException(404, { message: err.message });
                }
                throw err;
            }
        },
    );

    router.get("/jobs/:id/tailor", async (c) => {
        const id = Number(c.req.param("id"));
        const exists = await ctx.resumeMasterRepo.hasTailored(id);
        const meta = exists ? await ctx.resumeMasterRepo.readTailoredMeta(id) : null;
        return c.json({
            exists,
            master: meta?.master ?? null,
            updatedAt: meta?.updatedAt ?? null,
            tailoring: isTailoring(id),
        });
    });

    router.delete("/jobs/:id/tailor", async (c) => {
        const id = Number(c.req.param("id"));
        await ctx.resumeMasterRepo.deleteTailored(id);
        return c.json({ ok: true });
    });

    router.get("/jobs/:id/tailor/preview.pdf", async (c) => {
        const id = Number(c.req.param("id"));
        const tailored = await ctx.resumeMasterRepo.readTailored(id);
        if (!tailored) {
            throw new HTTPException(404, { message: "No tailored resume for this job" });
        }
        const name = resumeOutputName(tailored);
        const pdf = await generateResumePdf(tailored, name);
        return c.body(new Uint8Array(pdf), 200, {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${name}.pdf"`,
        });
    });

    return router;
}

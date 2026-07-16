import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { AppContext } from "../core/context";
import {
    getExternalApplyStatus,
    sendUserMessage,
    stopExternalApply,
    resumeExternalApply,
    takeRestoredSessionForResume,
    hasExternalApplySession,
    restoreSuspendedSession,
} from "../core/execution/external-apply/state";
import {
    deleteExternalAttachments,
    readExternalAttachment,
    saveUserExternalAttachment,
    validateUserExternalAttachment,
} from "../core/execution/external-apply/persistence";
import { startExternalApplyForJob } from "../core/execution/external-apply/worker";

export function createExternalApplyRouter(ctx: AppContext): OpenAPIHono {
    const router = new OpenAPIHono();

    router.get("/external-apply", (c) => {
        return c.json(getExternalApplyStatus());
    });

    router.post("/external-apply/message", async (c) => {
        const form = await c.req.formData();
        const jobId = Number(form.get("jobId"));
        const text = typeof form.get("text") === "string" ? String(form.get("text")) : "";
        if (!Number.isInteger(jobId)) throw new HTTPException(400, { message: "jobId is required" });
        const files = form.getAll("files").filter((value): value is File => value instanceof File);
        if (!text.trim() && files.length === 0) throw new HTTPException(400, { message: "text or files are required" });
        if (!hasExternalApplySession(jobId)) throw new HTTPException(409, { message: "No application chat exists for this job" });
        const attachments = [];
        try {
            files.forEach(validateUserExternalAttachment);
            for (const file of files) attachments.push(await saveUserExternalAttachment(jobId, file));
        } catch (e) {
            await deleteExternalAttachments(jobId, attachments);
            throw new HTTPException(400, { message: String(e) });
        }
        const ok = await sendUserMessage(jobId, text, attachments);
        if (!ok) throw new HTTPException(409, { message: "No application chat exists for this job" });
        return c.json({ ok: true });
    });

    router.get("/external-apply/:jobId/attachments/:id", async (c) => {
        const jobId = Number(c.req.param("jobId"));
        if (!Number.isInteger(jobId)) throw new HTTPException(400, { message: "Invalid job id" });
        const found = await readExternalAttachment(jobId, c.req.param("id"));
        if (!found) throw new HTTPException(404, { message: "Attachment not found" });
        return c.body(new Uint8Array(found.data), 200, {
            "Content-Type": found.meta.mimeType,
            "Content-Disposition": `inline; filename="${found.meta.filename}"`,
        });
    });

    router.post("/external-apply/resume", async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const jobId = Number(body?.jobId);
        if (!Number.isInteger(jobId)) throw new HTTPException(400, { message: "jobId is required" });
        let ok = await resumeExternalApply(jobId);
        if (!ok && takeRestoredSessionForResume(jobId)) {
            ok = (await startExternalApplyForJob(jobId, ctx)).started;
            if (!ok) restoreSuspendedSession(jobId);
        }
        if (!ok) throw new HTTPException(409, { message: "Could not resume session" });
        return c.json({ ok: true });
    });

    router.post("/external-apply/stop", async (c) => {
        const body = await c.req.json().catch(() => ({}));
        const jobId = Number(body?.jobId);
        if (!Number.isInteger(jobId)) throw new HTTPException(400, { message: "jobId is required" });
        const ok = stopExternalApply(jobId);
        if (!ok) throw new HTTPException(409, { message: "No active agent session" });
        return c.json({ ok: true });
    });

    return router;
}

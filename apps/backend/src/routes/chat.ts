import crypto from "node:crypto";
import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { AppContext } from "../core/context";
import { readAttachment } from "../core/chat/attachments";
import {
    createChatThread,
    deleteChatThread,
    getChatThread,
    isThreadBusy,
    listChatThreads,
    messagesFromSession,
    openChatSession,
    renameChatThread,
    runChatTurn,
} from "../core/chat/session";

export function createChatRouter(ctx: AppContext): OpenAPIHono {
    const router = new OpenAPIHono();

    router.get("/chat/threads", async (c) => {
        const threads = await listChatThreads();
        return c.json({ threads });
    });

    router.post("/chat/threads", async (c) => {
        const id = crypto.randomUUID();
        const thread = await createChatThread(id);
        return c.json({ thread });
    });

    router.get("/chat/threads/:id", async (c) => {
        const id = c.req.param("id");
        const thread = await getChatThread(id);
        if (!thread) throw new HTTPException(404, { message: "Thread not found" });
        const session = await openChatSession(id);
        if (!session) throw new HTTPException(404, { message: "Thread not found" });
        const messages = messagesFromSession(id, session);
        return c.json({ thread, messages, busy: isThreadBusy(id) });
    });

    router.post("/chat/threads/:id/message", async (c) => {
        const id = c.req.param("id");
        const thread = (await getChatThread(id)) ?? (await createChatThread(id));
        if (!thread) throw new HTTPException(404, { message: "Thread not found" });
        if (isThreadBusy(id)) throw new HTTPException(409, { message: "The assistant is still replying" });
        const body = await c.req.json().catch(() => ({}));
        const text = typeof body?.text === "string" ? body.text.trim() : "";
        if (!text) throw new HTTPException(400, { message: "text is required" });
        void runChatTurn(id, text, ctx);
        return c.json({ ok: true });
    });

    router.patch("/chat/threads/:id", async (c) => {
        const id = c.req.param("id");
        const body = await c.req.json().catch(() => ({}));
        const title = typeof body?.title === "string" ? body.title.trim() : "";
        if (!title) throw new HTTPException(400, { message: "title is required" });
        await renameChatThread(id, title);
        return c.json({ ok: true });
    });

    router.get("/chat/attachments/:id", async (c) => {
        const found = await readAttachment(c.req.param("id"));
        if (!found) throw new HTTPException(404, { message: "Attachment not found" });
        return c.body(new Uint8Array(found.data), 200, {
            "Content-Type": found.meta.mimeType,
            "Content-Disposition": `inline; filename="${found.meta.filename}"`,
        });
    });

    router.delete("/chat/threads/:id", async (c) => {
        await deleteChatThread(c.req.param("id"));
        return c.json({ ok: true });
    });

    return router;
}

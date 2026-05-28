import { OpenAPIHono } from "@hono/zod-openapi";
import { db, initDb } from "../db/client";
import { jobs, applications, applicationQuestions, discoveries } from "../db/schema";

const router = new OpenAPIHono();

router.delete("/database", async (c) => {
    await initDb();
    await db.delete(applicationQuestions);
    await db.delete(applications);
    await db.delete(jobs);
    await db.delete(discoveries);
    return c.json({ ok: true });
});

export default router;

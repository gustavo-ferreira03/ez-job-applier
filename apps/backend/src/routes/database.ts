import { OpenAPIHono } from "@hono/zod-openapi";
import { db, initDb } from "../db/client";
import { jobs, applications, applicationQuestions, executions } from "../db/schema";

const router = new OpenAPIHono();

router.delete("/database", async (c) => {
    await initDb();
    await db.delete(applicationQuestions);
    await db.delete(applications);
    await db.delete(jobs);
    await db.delete(executions);
    return c.json({ ok: true });
});

export default router;

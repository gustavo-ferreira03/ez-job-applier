import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "../db/client";
import { jobs, applications, applicationQuestions } from "../db/schema";

const router = new OpenAPIHono();

router.delete("/database", async (c) => {
    await db.delete(applicationQuestions);
    await db.delete(applications);
    await db.delete(jobs);
    return c.json({ ok: true });
});

export default router;

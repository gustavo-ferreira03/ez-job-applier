import { OpenAPIHono } from "@hono/zod-openapi";
import { db } from "../db/client";
import { jobs, applications, applicationQuestions } from "../db/schema";
import { clearExternalApplyStorage } from "../core/execution/external-apply/persistence";

const router = new OpenAPIHono();

router.delete("/database", async (c) => {
    await db.delete(applicationQuestions);
    await db.delete(applications);
    await db.delete(jobs);
    await clearExternalApplyStorage();
    return c.json({ ok: true });
});

export default router;

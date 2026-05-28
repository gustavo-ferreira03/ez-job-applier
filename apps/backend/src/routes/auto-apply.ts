import { OpenAPIHono } from "@hono/zod-openapi";
import * as autoApplyManager from "../core/auto-apply/manager";

const router = new OpenAPIHono();

router.get("/auto-apply", (c) => c.json(autoApplyManager.getStatus()));

router.post("/auto-apply/start", (c) => {
    autoApplyManager.start();
    return c.json({ ok: true });
});

router.post("/auto-apply/stop", (c) => {
    autoApplyManager.stop();
    return c.json({ ok: true });
});

export default router;

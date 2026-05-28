import { OpenAPIHono } from "@hono/zod-openapi";
import { getSettings, updateSettings } from "../repositories/settings";

const router = new OpenAPIHono();

router.get("/settings", async (c) => c.json(await getSettings()));

router.patch("/settings", async (c) => {
    const body = await c.req.json<{ browserVisible?: boolean }>();
    const updated = await updateSettings(body);
    return c.json(updated);
});

export default router;

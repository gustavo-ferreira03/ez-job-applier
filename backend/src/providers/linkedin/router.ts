import { Hono } from "hono";
import { getContext, closeContext } from "../../browser";
import { login } from "./services/auth";

const router = new Hono();

router.post("/auth", async (c) => {
    const context = await getContext();
    const page = context.pages()[0] ?? (await context.newPage());
    await login(page);
    await closeContext();
    return c.json({ success: true });
});

export default router;

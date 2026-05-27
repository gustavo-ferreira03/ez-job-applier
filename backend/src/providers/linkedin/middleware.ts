import { createMiddleware } from "hono/factory";
import type { Page } from "playwright-core";
import { getContext } from "../../browser";
import { isLoggedIn } from "./services/status";

type Variables = { page: Page };

export const withPage = createMiddleware<{ Variables: Variables }>(
    async (c, next) => {
        const context = await getContext();
        const page = await context.newPage();
        c.set("page", page);
        await next();
    },
);

export const requireAuth = createMiddleware<{ Variables: Variables }>(
    async (c, next) => {
        const page = c.var.page;
        if (!(await isLoggedIn(page))) {
            await page.close().catch(() => undefined);
            return c.json(
                { error: "Not authenticated. Call POST /auth first." },
                401,
            );
        }
        await next();
    },
);

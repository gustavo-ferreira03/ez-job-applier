import { createMiddleware } from "hono/factory";
import type { BrowserContext, Page } from "playwright-core";
import { closeContext, openContext } from "../../browser";
import { isLoggedIn } from "./services/status";

type Variables = { context: BrowserContext; page: Page };

export const withPage = createMiddleware<{ Variables: Variables }>(
    async (c, next) => {
        const context = await openContext({ visible: false });
        const page = context.pages()[0] ?? (await context.newPage());
        c.set("page", page);
        c.set("context", context);
        await next();
    },
);

export const withVisiblePage = createMiddleware<{ Variables: Variables }>(
    async (c, next) => {
        const context = await openContext({ visible: true });
        const page = context.pages()[0] ?? (await context.newPage());
        c.set("page", page);
        c.set("context", context);
        await next();
    },
);

export const requireAuth = createMiddleware<{ Variables: Variables }>(
    async (c, next) => {
        const page = c.var.page;
        if (!(await isLoggedIn(page))) {
            await closeContext(c.var.context);
            return c.json(
                { error: "Not authenticated. Call POST /auth first." },
                401,
            );
        }
        await next();
    },
);

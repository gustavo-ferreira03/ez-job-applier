import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import coreRouter from "./core/router";
import linkedinRouter from "./providers/linkedin/router";
import resumesRouter from "./repositories/resumes/router";
import { registerProvider } from "./core/registry";
import { linkedinProvider } from "./providers/linkedin/index";

registerProvider(linkedinProvider);

const app = new Hono();

app.onError((err, c) => {
    console.error(err);
    return c.json({ error: err.message }, 500);
});

app.route("/", coreRouter);
app.route("/linkedin", linkedinRouter);
app.route("/resumes", resumesRouter);

app.get(
    "/openapi",
    openAPIRouteHandler(app, {
        documentation: {
            info: { title: "EZ Job Applier API", version: "1.0.0" },
            servers: [{ url: "http://localhost:3000" }],
        },
    }),
);

app.get(
    "/docs",
    apiReference({ url: "/openapi", theme: "saturn" }),
);

serve(
    {
        fetch: app.fetch,
        port: 3000,
    },
    (info) => {
        console.log(`Server is running on http://localhost:${info.port}`);
        console.log(`API docs available at http://localhost:${info.port}/docs`);
    },
);

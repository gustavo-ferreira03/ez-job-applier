import { serve } from "@hono/node-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import coreRouter from "./core/router";
import linkedinRouter from "./providers/linkedin/router";
import resumesRouter from "./repositories/resumes/router";
import { registerProvider } from "./core/registry";
import { linkedinProvider } from "./providers/linkedin/index";

registerProvider(linkedinProvider);

const app = new OpenAPIHono();

app.onError((err, c) => {
    console.error(err);
    return c.json({ error: err.message }, 500);
});

app.route("/", coreRouter);
app.route("/linkedin", linkedinRouter);
app.route("/resumes", resumesRouter);

app.doc("/openapi", {
    openapi: "3.0.0",
    info: { title: "EZ Job Applier API", version: "1.0.0" },
    servers: [{ url: "http://localhost:3000" }],
});

app.get("/docs", apiReference({ url: "/openapi", theme: "saturn" }));

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

import { serve } from "@hono/node-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import discoveriesRouter from "./routes/discoveries";
import jobsRouter from "./routes/jobs";
import applicationsRouter from "./routes/applications";
import resumesRouter from "./routes/resumes";
import autoApplyRouter from "./routes/auto-apply";
import settingsRouter from "./routes/settings";
import databaseRouter from "./routes/database";
import { registerProvider } from "./core/registry";
import { linkedinProvider } from "./providers/linkedin/index";

registerProvider(linkedinProvider);

const app = new OpenAPIHono();

app.use("*", cors());

app.onError((err, c) => {
    console.error(err);
    return c.json({ error: err.message }, 500);
});

app.route("/", discoveriesRouter);
app.route("/", jobsRouter);
app.route("/", applicationsRouter);
app.route("/", resumesRouter);
app.route("/", autoApplyRouter);
app.route("/", settingsRouter);
app.route("/", databaseRouter);

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

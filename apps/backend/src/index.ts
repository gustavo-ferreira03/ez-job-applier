import { serve } from "@hono/node-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { db, initDb } from "./db/client";
import { linkedinProvider } from "./providers/linkedin/index";
import { JobRepository } from "./infra/JobRepository";
import { ApplicationRepository } from "./infra/ApplicationRepository";
import { DiscoveryRepository } from "./infra/DiscoveryRepository";
import { ResumeRepository } from "./infra/ResumeRepository";
import { ProviderRegistry } from "./infra/ProviderRegistry";
import { createDiscoveriesRouter } from "./routes/discoveries";
import { createJobsRouter } from "./routes/jobs";
import { createApplicationsRouter } from "./routes/applications";
import { createAutoApplyRouter } from "./routes/auto-apply";
import resumesRouter from "./routes/resumes";
import settingsRouter from "./routes/settings";
import databaseRouter from "./routes/database";
import type { AppContext } from "./core/context";

await initDb();

const providerRegistry = new ProviderRegistry();
providerRegistry.register(linkedinProvider);

const ctx: AppContext = {
    jobRepo: new JobRepository(db),
    appRepo: new ApplicationRepository(db),
    discoveryRepo: new DiscoveryRepository(db),
    resumeRepo: new ResumeRepository(),
    providerRegistry,
};

const app = new OpenAPIHono();

app.use("*", cors());

app.onError((err, c) => {
    console.error(err);
    return c.json({ error: err.message }, 500);
});

app.route("/", createDiscoveriesRouter(ctx));
app.route("/", createJobsRouter(ctx));
app.route("/", createApplicationsRouter(ctx));
app.route("/", createAutoApplyRouter(ctx));
app.route("/", resumesRouter);
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

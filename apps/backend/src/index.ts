import { serve } from "@hono/node-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { db, initDb } from "./db/client";
import { linkedinProvider } from "./providers/linkedin/index";
import { JobRepository } from "./infra/JobRepository";
import { ApplicationRepository } from "./infra/ApplicationRepository";
import { ExecutionRepository } from "./infra/ExecutionRepository";
import { ResumeRepository } from "./infra/ResumeRepository";
import { ProviderRegistry } from "./infra/ProviderRegistry";
import { createJobsRouter } from "./routes/jobs";
import { createApplicationsRouter } from "./routes/applications";
import { createAutoApplyRouter } from "./routes/auto-apply";
import { createExecutionRouter } from "./routes/execution";
import resumesRouter from "./routes/resumes";
import settingsRouter from "./routes/settings";
import databaseRouter from "./routes/database";
import { startExecution } from "./core/execution/manager";
import type { AppContext } from "./core/context";

await initDb();

const providerRegistry = new ProviderRegistry();
providerRegistry.register(linkedinProvider);

const ctx: AppContext = {
    jobRepo: new JobRepository(db),
    appRepo: new ApplicationRepository(db),
    executionRepo: new ExecutionRepository(db),
    resumeRepo: new ResumeRepository(),
    providerRegistry,
};

// Auto-resume: find the most recent execution interrupted by a server restart
const allExecutions = await ctx.executionRepo.list();
const interrupted = allExecutions.find((e) => e.errorMessage === "Server restarted");
if (interrupted) {
    console.log("[execution] resuming from server restart...");
    startExecution(interrupted.config, ctx, {
        cycleMaxMs: interrupted.cycleMaxMs,
        intervalMs: interrupted.intervalMs,
    }).catch((e) => console.error("[execution] resume failed:", e));
}

const app = new OpenAPIHono();

app.use("*", cors());

app.onError((err, c) => {
    console.error(err);
    return c.json({ error: err.message }, 500);
});

app.route("/", createJobsRouter(ctx));
app.route("/", createApplicationsRouter(ctx));
app.route("/", createAutoApplyRouter(ctx));
app.route("/", createExecutionRouter(ctx));
app.route("/", resumesRouter);
app.route("/", settingsRouter);
app.route("/", databaseRouter);

app.doc("/openapi", {
    openapi: "3.0.0",
    info: { title: "EZ Job Applier API", version: "1.0.0" },
    servers: [{ url: "http://localhost:3000" }],
});

app.get("/docs", apiReference({ url: "/openapi", theme: "saturn" }));

serve({ fetch: app.fetch, port: 3000 }, (info) => {
    console.log(`Server running on http://localhost:${info.port}`);
});

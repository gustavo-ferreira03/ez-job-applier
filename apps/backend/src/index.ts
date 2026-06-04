import { serve } from "@hono/node-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { db } from "./db/client";
import { linkedinProvider } from "./providers/linkedin/index";
import { JobRepository } from "./infra/JobRepository";
import { ApplicationRepository } from "./infra/ApplicationRepository";
import { ExecutionRepository } from "./infra/ExecutionRepository";
import { ResumeRepository } from "./infra/ResumeRepository";
import { ProviderRegistry } from "./infra/ProviderRegistry";
import { PiLlmClient } from "./infra/PiLlmClient";
import { createJobsRouter } from "./routes/jobs";
import { createApplicationsRouter } from "./routes/applications";
import { createAutoApplyRouter } from "./routes/auto-apply";
import { createExecutionRouter } from "./routes/execution";
import resumesRouter from "./routes/resumes";
import { createSettingsRouter } from "./routes/settings";
import databaseRouter from "./routes/database";
import { startExecution, registerWorker } from "./core/execution/manager";
import { createAutoAnswerWorker } from "./core/execution/auto-answer-worker";
import { VNC_PORT } from "./core/login/vnc";
import type { AppContext } from "./core/context";

const providerRegistry = new ProviderRegistry();
providerRegistry.register(linkedinProvider);

registerWorker(createAutoAnswerWorker);

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(moduleDir, "..");
const llmAuth = AuthStorage.create(path.join(backendRoot, "storage", "pi-auth.json"));
const modelRegistry = ModelRegistry.create(llmAuth);

const ctx: AppContext = {
    jobRepo: new JobRepository(db),
    appRepo: new ApplicationRepository(db),
    executionRepo: new ExecutionRepository(db),
    resumeRepo: new ResumeRepository(),
    providerRegistry,
    llmAuth,
    modelRegistry,
    llm: new PiLlmClient(modelRegistry),
};
const activeExecution = await ctx.executionRepo.getActive();
if (activeExecution) {
    startExecution(activeExecution.config, ctx, {
        cycleMaxMs: activeExecution.cycleMaxMs,
        intervalMs: activeExecution.intervalMs,
        existingId: activeExecution.id,
    }).catch((e) => console.error("[execution] resume failed:", e));
} else {
    const allExecutions = await ctx.executionRepo.list();
    const interrupted = allExecutions.find((e) => e.errorMessage === "Server restarted");
    if (interrupted) {
        startExecution(interrupted.config, ctx, {
            cycleMaxMs: interrupted.cycleMaxMs,
            intervalMs: interrupted.intervalMs,
        }).catch((e) => console.error("[execution] resume failed:", e));
    }
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
app.route("/", createSettingsRouter(ctx));
app.route("/", databaseRouter);

app.doc("/openapi", {
    openapi: "3.0.0",
    info: { title: "EZ Job Applier API", version: "1.0.0" },
    servers: [{ url: "http://localhost:3000" }],
});

app.get("/docs", apiReference({ url: "/openapi", theme: "saturn" }));
const wss = new WebSocketServer({ noServer: true });
wss.on("connection", (ws) => {
    const vnc = net.createConnection(VNC_PORT, "127.0.0.1");
    ws.on("message", (data) => { if (vnc.writable) vnc.write(data as Buffer); });
    vnc.on("data", (data) => { if (ws.readyState === ws.OPEN) ws.send(data); });
    const cleanup = () => { ws.terminate(); vnc.destroy(); };
    ws.on("close", () => vnc.destroy());
    ws.on("error", cleanup);
    vnc.on("close", () => ws.terminate());
    vnc.on("error", cleanup);
});

const server = serve({ fetch: app.fetch, port: 3000 }, (info) => {
    console.log(`Server running on http://localhost:${info.port}`);
});

server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/vnc-ws") {
        wss.handleUpgrade(req, socket as net.Socket, head, (ws) => {
            wss.emit("connection", ws, req);
        });
    }
});

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
    closeContext,
    getChromeProfileDir,
    getContext,
    isContextOpen,
} from "./browser";
import jobsRouter from "./repositories/jobs/router";
import linkedinRouter from "./providers/linkedin/router";
import resumesRouter from "./repositories/resumes/router";

const app = new Hono();

app.onError((err, c) => {
    console.error(err);
    return c.json({ error: err.message }, 500);
});

app.route("/linkedin", linkedinRouter);
app.route("/jobs", jobsRouter);
app.route("/resumes", resumesRouter);

app.post("/browser/start", async (c) => {
    await getContext();
    return c.json({ running: true, profile: getChromeProfileDir() });
});

app.post("/browser/stop", async (c) => {
    await closeContext();
    return c.json({ running: false });
});

app.get("/browser/status", (c) => {
    return c.json({ running: isContextOpen(), profile: getChromeProfileDir() });
});

app.get("/", (c) => {
    return c.text("Hello Hono!");
});

serve(
    {
        fetch: app.fetch,
        port: 3000,
    },
    (info) => {
        console.log(`Server is running on http://localhost:${info.port}`);
    },
);

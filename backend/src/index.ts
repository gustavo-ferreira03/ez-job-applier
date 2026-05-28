import { serve } from "@hono/node-server";
import { Hono } from "hono";
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

serve(
    {
        fetch: app.fetch,
        port: 3000,
    },
    (info) => {
        console.log(`Server is running on http://localhost:${info.port}`);
    },
);

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import linkedinRouter from "./providers/linkedin/router";
import resumesRouter from "./repositories/resumes/router";

const app = new Hono();

app.route("/linkedin", linkedinRouter);
app.route("/resumes", resumesRouter);

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

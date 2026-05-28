import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getJob, listJobs } from "./services/storage";

const router = new Hono();

router.get("/", async (c) => {
    return c.json({ jobs: await listJobs() });
});

router.get("/:jobId", async (c) => {
    const job = await getJob(c.req.param("jobId"));
    if (!job) throw new HTTPException(404, { message: "Vaga não encontrada" });
    return c.json(job);
});

export default router;

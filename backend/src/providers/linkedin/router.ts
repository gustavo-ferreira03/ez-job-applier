import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { listJobIds, saveJob } from "../../repositories/jobs/services/storage";
import { login } from "./services/auth";
import { discoverJobs } from "./services/jobs";
import { withPage, requireAuth } from "./middleware";
import type { SearchConfig } from "./services/types";

const router = new Hono();

router.post("/auth", withPage, async (c) => {
    try {
        await login(c.var.page);
        return c.json({ success: true });
    } finally {
        await c.var.page.close().catch(() => undefined);
    }
});

router.get("/jobs", withPage, requireAuth, async (c) => {
    const q = c.req.query();
    const config: SearchConfig = {
        keywords: q.keywords,
        location: q.location,
        easyApply: q.easyApply === "true",
        workType: q.workType,
        experienceLevel: q.experienceLevel ? q.experienceLevel.split(",") : undefined,
        jobType: q.jobType ? q.jobType.split(",") : undefined,
        datePosted: q.datePosted,
        maxJobs: q.maxJobs ? Number(q.maxJobs) : undefined,
        includeTopApplicant: q.includeTopApplicant === "true",
        fillSkillGaps: q.fillSkillGaps === "true",
        skipJobIds: await listJobIds(),
    };

    const page = c.var.page;
    return streamSSE(c, async (s) => {
        try {
            for await (const job of discoverJobs(page, config)) {
                await saveJob(job);
                await s.writeSSE({ event: "job", data: JSON.stringify(job) });
            }
            await s.writeSSE({ event: "done", data: "" });
        } finally {
            await page.close().catch(() => undefined);
        }
    });
});

export default router;

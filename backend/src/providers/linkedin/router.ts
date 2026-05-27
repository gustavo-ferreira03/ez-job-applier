import { Hono } from "hono";
import { stream } from "hono/streaming";
import { login } from "./services/auth";
import { isLoggedIn } from "./services/status";
import { discoverJobs } from "./services/jobs";
import { withPage, requireAuth } from "./middleware";
import type { SearchConfig } from "./services/types";

const router = new Hono();

router.post("/auth", withPage, async (c) => {
    await login(c.var.page);
    return c.json({ success: true });
});

router.get("/status", withPage, async (c) => {
    const loggedIn = await isLoggedIn(c.var.page);
    return c.json({ loggedIn });
});

router.get("/jobs", withPage, requireAuth, async (c) => {
    const q = c.req.query();
    const config: SearchConfig = {
        keywords: q.keywords,
        location: q.location,
        easyApply: q.easyApply === "true",
        workType: q.workType,
        experienceLevel: q.experienceLevel
            ? q.experienceLevel.split(",")
            : undefined,
        jobType: q.jobType ? q.jobType.split(",") : undefined,
        datePosted: q.datePosted,
        maxJobs: q.maxJobs ? Number(q.maxJobs) : undefined,
        includeTopApplicant: q.includeTopApplicant === "true",
        fillSkillGaps: q.fillSkillGaps === "true",
    };

    const page = c.var.page;
    return stream(c, async (s) => {
        for await (const job of discoverJobs(page, config)) {
            await s.write(JSON.stringify(job) + "\n");
        }
    });
});

export default router;

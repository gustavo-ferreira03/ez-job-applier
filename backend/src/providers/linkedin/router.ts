import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { HTTPException } from "hono/http-exception";
import { listJobIds, saveJob, getJob } from "../../repositories/jobs/services/storage";
import { getDefaultResume } from "../../repositories/resumes/services/settings";
import { RESUMES_DIR } from "../../repositories/resumes/services/storage";
import path from "node:path";
import { closeLinkedinContext, saveLinkedinSession } from "./browser";
import { login } from "./services/auth";
import { discoverJobs } from "./services/jobs";
import { runEasyApply } from "./services/easyApply";
import { withPage, withVisiblePage, requireAuth } from "./middleware";
import { upsertApplication, replaceQuestions } from "../../repositories/linkedin-applications/services/storage";
import type { SearchConfig } from "./services/types";

const router = new Hono();

router.post("/auth", withVisiblePage, async (c) => {
    try {
        await login(c.var.page);
        await saveLinkedinSession(c.var.context);
        return c.json({ success: true });
    } finally {
        await closeLinkedinContext(c.var.context);
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
            await saveLinkedinSession(c.var.context);
            await s.writeSSE({ event: "done", data: "" });
        } finally {
            await closeLinkedinContext(c.var.context);
        }
    });
});

/**
 * POST /linkedin/easy-apply/:jobId/questions
 * Opens the Easy Apply modal and returns all form questions without submitting.
 * Use the returned questions to collect answers, then call /submit.
 */
router.get("/easy-apply/:jobId/questions", withPage, requireAuth, async (c) => {
    const job = await getJob(c.req.param("jobId"));
    if (!job) throw new HTTPException(404, { message: "Vaga não encontrada" });
    if (!job.easyApply)
        throw new HTTPException(400, { message: "Vaga não é Easy Apply" });

    const defaultResume = await getDefaultResume();
    const resumePath = defaultResume
        ? path.join(RESUMES_DIR, defaultResume)
        : undefined;

    const resumeFilename = defaultResume ?? undefined;

    try {
        const result = await runEasyApply(c.var.page, job.url, {
            resumePath,
            shouldSubmit: false,
        });
        const application = await upsertApplication(
            job.jobId,
            result.status,
            resumeFilename,
            result.errorMessage,
        );
        await replaceQuestions(application.id, result.questions);
        await saveLinkedinSession(c.var.context);
        return c.json(result);
    } finally {
        await closeLinkedinContext(c.var.context);
    }
});

/**
 * POST /linkedin/easy-apply/:jobId/submit
 * Body: { answers?: Record<string, string>, resumeFilename?: string }
 * Fills the Easy Apply form with the provided answers and submits the application.
 */
router.post("/easy-apply/:jobId/submit", withPage, requireAuth, async (c) => {
    const job = await getJob(c.req.param("jobId"));
    if (!job) throw new HTTPException(404, { message: "Vaga não encontrada" });
    if (!job.easyApply)
        throw new HTTPException(400, { message: "Vaga não é Easy Apply" });

    type ApplyBody = { answers?: Record<string, string>; resumeFilename?: string };
    const body: ApplyBody = await c.req.json<ApplyBody>().catch(() => ({}));

    const resumeFilename =
        body.resumeFilename ?? (await getDefaultResume()) ?? undefined;
    const resumePath = resumeFilename
        ? path.join(RESUMES_DIR, resumeFilename)
        : undefined;

    try {
        const result = await runEasyApply(c.var.page, job.url, {
            answers: body.answers ?? {},
            resumePath,
            shouldSubmit: true,
        });
        const application = await upsertApplication(
            job.jobId,
            result.status,
            resumeFilename,
            result.errorMessage,
        );
        await replaceQuestions(application.id, result.questions);
        await saveLinkedinSession(c.var.context);
        return c.json(result);
    } finally {
        await closeLinkedinContext(c.var.context);
    }
});

export default router;

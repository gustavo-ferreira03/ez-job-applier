import { desc, eq, inArray } from "drizzle-orm";
import { db, initDb } from "../../db/client";
import { jobs, applications, applicationQuestions } from "../../db/schema";
import type { JobSummary } from "./types";
import type { ApplicationStatus } from "../types";

export async function listJobs(): Promise<JobSummary[]> {
    await initDb();

    const rows = await db
        .select({ job: jobs, application: applications })
        .from(jobs)
        .leftJoin(applications, eq(applications.jobId, jobs.id))
        .orderBy(desc(jobs.updatedAt));

    const appIds = rows
        .filter((r) => r.application !== null)
        .map((r) => r.application!.id);

    const unansweredMap = new Map<number, number>();
    if (appIds.length > 0) {
        const qRows = await db
            .select({ applicationId: applicationQuestions.applicationId, answer: applicationQuestions.answer })
            .from(applicationQuestions)
            .where(inArray(applicationQuestions.applicationId, appIds));

        for (const q of qRows) {
            if (q.answer === null) {
                unansweredMap.set(q.applicationId, (unansweredMap.get(q.applicationId) ?? 0) + 1);
            }
        }
    }

    return rows.map(({ job, application }) => ({
        id: job.id,
        externalId: job.externalId,
        provider: job.provider,
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.url,
        preferences: JSON.parse(job.preferences ?? "[]"),
        skills: JSON.parse(job.skills ?? "[]"),
        about: job.about,
        applicationUrl: job.applicationUrl,
        status: (application?.status ?? "FOUND") as ApplicationStatus,
        resumeFilename: application?.resumeFilename ?? null,
        errorMessage: application?.errorMessage ?? null,
        unansweredCount: application ? (unansweredMap.get(application.id) ?? 0) : 0,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
    }));
}

import { eq } from "drizzle-orm";
import { db, initDb } from "../../db/client";
import { jobs, applications, applicationQuestions } from "../../db/schema";
import { questionFromRow } from "../../repositories/applications/services/storage";
import type { JobDetail } from "./types";
import type { ApplicationStatus } from "../types";

export async function getJob(id: number): Promise<JobDetail | null> {
    await initDb();

    const [row] = await db
        .select({ job: jobs, application: applications })
        .from(jobs)
        .leftJoin(applications, eq(applications.jobId, jobs.id))
        .where(eq(jobs.id, id))
        .limit(1);

    if (!row) return null;

    const { job, application } = row;

    const questionRows = application
        ? await db
              .select()
              .from(applicationQuestions)
              .where(eq(applicationQuestions.applicationId, application.id))
        : [];

    return {
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
        unansweredCount: questionRows.filter((q) => q.answer === null).length,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        questions: questionRows.map(questionFromRow),
    };
}

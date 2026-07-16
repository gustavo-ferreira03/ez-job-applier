import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobs, applications, applicationQuestions } from "../db/schema";
import type { IJobRepo } from "../core/ports";
import type { Job } from "../core/types";
import type { ApplicationStatus } from "../core/types";
import type { JobDetail, JobSummary } from "../core/jobs/types";
import { deriveTags } from "../core/jobs/tags";
import type { ApplicationQuestion } from "../core/types";

function parseList(value: string | null): string[] {
    if (!value) return [];
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed)
            ? parsed.filter((item): item is string => typeof item === "string")
            : [];
    } catch {
        return [];
    }
}

function parseOptions(value: string | null): string[] {
    return parseList(value);
}

function serializeList(values: string[]): string {
    return JSON.stringify(values);
}

function jobFromRow(row: typeof jobs.$inferSelect): Job {
    return {
        jobId: row.externalId,
        provider: row.provider,
        title: row.title,
        company: row.company,
        location: row.location,
        url: row.url,
        preferences: parseList(row.preferences),
        skills: parseList(row.skills),
        about: row.about,
        applicationUrl: row.applicationUrl,
    };
}

function questionFromRow(row: typeof applicationQuestions.$inferSelect): ApplicationQuestion {
    return {
        label: row.label,
        answer: row.answer ?? undefined,
        fieldType: (row.fieldType ?? undefined) as ApplicationQuestion["fieldType"],
        options: parseOptions(row.options),
    };
}

export class JobRepository implements IJobRepo {
    constructor(private db: Db) {}

    async getById(id: number): Promise<Job | null> {
        const [row] = await this.db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
        return row ? jobFromRow(row) : null;
    }

    async getByProvider(provider: string, externalId: string): Promise<Job | null> {
        const [row] = await this.db
            .select()
            .from(jobs)
            .where(and(eq(jobs.provider, provider), eq(jobs.externalId, externalId)))
            .limit(1);
        return row ? jobFromRow(row) : null;
    }

    async getIdByProvider(provider: string, externalId: string): Promise<number | null> {
        const [row] = await this.db
            .select({ id: jobs.id })
            .from(jobs)
            .where(and(eq(jobs.provider, provider), eq(jobs.externalId, externalId)))
            .limit(1);
        return row?.id ?? null;
    }

    async listIds(provider?: string): Promise<Set<string>> {
        const rows = provider
            ? await this.db
                  .select({ externalId: jobs.externalId })
                  .from(jobs)
                  .where(eq(jobs.provider, provider))
            : await this.db.select({ externalId: jobs.externalId }).from(jobs);
        return new Set(rows.map((r) => r.externalId));
    }

    async listSkipIds(provider: string): Promise<Set<string>> {
        const rows = await this.db
            .select({ externalId: jobs.externalId })
            .from(jobs)
            .innerJoin(applications, eq(applications.jobId, jobs.id))
            .where(eq(jobs.provider, provider));
        return new Set(rows.map((r) => r.externalId));
    }

    async save(job: Job): Promise<void> {
        const timestamp = new Date().toISOString();
        await this.db
            .insert(jobs)
            .values({
                provider: job.provider,
                externalId: job.jobId,
                title: job.title,
                company: job.company,
                location: job.location,
                url: job.url,
                preferences: serializeList(job.preferences),
                skills: serializeList(job.skills),
                tags: serializeList(deriveTags(job)),
                about: job.about,
                applicationUrl: job.applicationUrl,
                createdAt: timestamp,
                updatedAt: timestamp,
            })
            .onConflictDoUpdate({
                target: [jobs.provider, jobs.externalId],
                set: {
                    title: job.title,
                    company: job.company,
                    location: job.location,
                    url: job.url,
                    preferences: serializeList(job.preferences),
                    skills: serializeList(job.skills),
                    tags: serializeList(deriveTags(job)),
                    about: job.about,
                    applicationUrl: job.applicationUrl,
                    updatedAt: timestamp,
                },
            });
    }

    async getDetail(id: number): Promise<JobDetail | null> {
        const [row] = await this.db
            .select({ job: jobs, application: applications })
            .from(jobs)
            .leftJoin(applications, eq(applications.jobId, jobs.id))
            .where(eq(jobs.id, id))
            .limit(1);

        if (!row) return null;

        const { job, application } = row;
        const questionRows = application
            ? await this.db
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
            preferences: parseList(job.preferences),
            skills: parseList(job.skills),
            tags: parseList(job.tags),
            about: job.about,
            applicationUrl: job.applicationUrl,
            status: (application?.status ?? "FOUND") as ApplicationStatus,
            processing: (application?.processing ?? 0) !== 0,
            resumeFilename: application?.resumeFilename ?? null,
            errorMessage: application?.errorMessage ?? null,
            unansweredCount: questionRows.filter((q) => q.answer === null).length,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            questions: questionRows.map(questionFromRow),
        };
    }

    async listSummaries(): Promise<JobSummary[]> {
        const rows = await this.db
            .select({ job: jobs, application: applications })
            .from(jobs)
            .leftJoin(applications, eq(applications.jobId, jobs.id))
            .orderBy(desc(jobs.updatedAt));

        const appIds = rows
            .filter((r) => r.application !== null)
            .map((r) => r.application!.id);

        const unansweredMap = new Map<number, number>();
        if (appIds.length > 0) {
            const qRows = await this.db
                .select({
                    applicationId: applicationQuestions.applicationId,
                    answer: applicationQuestions.answer,
                })
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
            preferences: parseList(job.preferences),
            skills: parseList(job.skills),
            tags: parseList(job.tags),
            about: job.about,
            applicationUrl: job.applicationUrl,
            status: (application?.status ?? "FOUND") as ApplicationStatus,
            processing: (application?.processing ?? 0) !== 0,
            resumeFilename: application?.resumeFilename ?? null,
            errorMessage: application?.errorMessage ?? null,
            unansweredCount: application ? (unansweredMap.get(application.id) ?? 0) : 0,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
        }));
    }
}

import { and, desc, eq } from "drizzle-orm";
import { db, initDb } from "../../../db/client";
import { jobs, type JobRow } from "../../../db/schema";
import type { Job } from "../../../core/types";

function now(): string {
    return new Date().toISOString();
}

function serializeList(values: string[]): string {
    return JSON.stringify(values);
}

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

export function jobFromRow(row: JobRow): Job {
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

export async function saveJob(job: Job): Promise<void> {
    await initDb();
    const timestamp = now();

    await db
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
                about: job.about,
                applicationUrl: job.applicationUrl,
                updatedAt: timestamp,
            },
        });
}

export async function listJobs(): Promise<Job[]> {
    await initDb();
    const rows = await db.select().from(jobs).orderBy(desc(jobs.updatedAt));
    return rows.map(jobFromRow);
}

export async function getJob(provider: string, externalId: string): Promise<Job | null>;
export async function getJob(externalId: string): Promise<Job | null>;
export async function getJob(providerOrExternalId: string, externalId?: string): Promise<Job | null> {
    await initDb();
    const [row] = externalId
        ? await db.select().from(jobs)
            .where(and(eq(jobs.provider, providerOrExternalId), eq(jobs.externalId, externalId)))
            .limit(1)
        : await db.select().from(jobs)
            .where(eq(jobs.externalId, providerOrExternalId))
            .limit(1);
    return row ? jobFromRow(row) : null;
}

export async function getJobRow(provider: string, externalId: string): Promise<JobRow | null> {
    await initDb();
    const [row] = await db.select().from(jobs)
        .where(and(eq(jobs.provider, provider), eq(jobs.externalId, externalId)))
        .limit(1);
    return row ?? null;
}

export async function getJobById(id: number): Promise<Job | null> {
    await initDb();
    const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
    return row ? jobFromRow(row) : null;
}

export async function listJobIds(provider?: string): Promise<Set<string>> {
    await initDb();
    const rows = provider
        ? await db.select({ externalId: jobs.externalId }).from(jobs).where(eq(jobs.provider, provider))
        : await db.select({ externalId: jobs.externalId }).from(jobs);
    return new Set(rows.map((r) => r.externalId));
}

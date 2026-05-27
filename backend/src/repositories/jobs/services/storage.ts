import { desc, eq } from "drizzle-orm";
import { db, initDb } from "../../../db/client";
import { linkedinJobs, type LinkedinJobRow } from "../../../db/schema";
import type { Job } from "../../../providers/linkedin/services/types";

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

export function jobFromRow(row: LinkedinJobRow): Job {
    return {
        jobId: row.linkedinJobId,
        title: row.title,
        company: row.company,
        location: row.location,
        url: row.url,
        easyApply: row.easyApply,
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
        .insert(linkedinJobs)
        .values({
            linkedinJobId: job.jobId,
            title: job.title,
            company: job.company,
            location: job.location,
            url: job.url,
            easyApply: job.easyApply,
            preferences: serializeList(job.preferences),
            skills: serializeList(job.skills),
            about: job.about,
            applicationUrl: job.applicationUrl,
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        .onConflictDoUpdate({
            target: linkedinJobs.linkedinJobId,
            set: {
                title: job.title,
                company: job.company,
                location: job.location,
                url: job.url,
                easyApply: job.easyApply,
                preferences: serializeList(job.preferences),
                skills: serializeList(job.skills),
                about: job.about,
                applicationUrl: job.applicationUrl,
                updatedAt: timestamp,
            },
        });
}

export async function saveJobs(items: Job[]): Promise<void> {
    for (const job of items) await saveJob(job);
}

export async function listJobs(): Promise<Job[]> {
    await initDb();
    const rows = await db
        .select()
        .from(linkedinJobs)
        .orderBy(desc(linkedinJobs.updatedAt));
    return rows.map(jobFromRow);
}

export async function getJob(jobId: string): Promise<Job | null> {
    await initDb();
    const [row] = await db
        .select()
        .from(linkedinJobs)
        .where(eq(linkedinJobs.linkedinJobId, jobId))
        .limit(1);
    return row ? jobFromRow(row) : null;
}

export async function listJobIds(): Promise<Set<string>> {
    await initDb();
    const rows = await db
        .select({ linkedinJobId: linkedinJobs.linkedinJobId })
        .from(linkedinJobs);
    return new Set(rows.map((row) => row.linkedinJobId));
}

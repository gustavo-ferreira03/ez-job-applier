import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, initDb } from "../../../db/client";
import {
    jobs,
    applications,
    applicationQuestions,
    type ApplicationRow,
    type ApplicationQuestionRow,
} from "../../../db/schema";
import { getJobRow } from "../../jobs/services/storage";
import type { ApplicationQuestion, ApplicationStatus } from "../../../core/types";

function now(): string {
    return new Date().toISOString();
}

function serializeOptions(options: string[] | undefined): string {
    return JSON.stringify(options ?? []);
}

function parseOptions(value: string | null): string[] {
    if (!value) return [];
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed)
            ? parsed.filter((o): o is string => typeof o === "string")
            : [];
    } catch {
        return [];
    }
}

export function questionFromRow(row: ApplicationQuestionRow): ApplicationQuestion {
    return {
        label: row.label,
        answer: row.answer ?? undefined,
        fieldType: (row.fieldType ?? undefined) as ApplicationQuestion["fieldType"],
        options: parseOptions(row.options),
    };
}

export async function getApplication(
    provider: string,
    externalId: string,
): Promise<ApplicationRow | null> {
    await initDb();
    const jobRow = await getJobRow(provider, externalId);
    if (!jobRow) return null;

    const [row] = await db
        .select()
        .from(applications)
        .where(eq(applications.jobId, jobRow.id))
        .limit(1);
    return row ?? null;
}

export async function upsertApplication(
    provider: string,
    externalId: string,
    status: ApplicationStatus,
    resumeFilename?: string,
    errorMessage?: string,
): Promise<ApplicationRow> {
    await initDb();
    const jobRow = await getJobRow(provider, externalId);
    if (!jobRow) throw new Error(`Job not found: ${provider}/${externalId}`);

    const timestamp = now();

    await db
        .insert(applications)
        .values({
            jobId: jobRow.id,
            status,
            resumeFilename: resumeFilename ?? null,
            errorMessage: errorMessage ?? null,
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        .onConflictDoUpdate({
            target: applications.jobId,
            set: {
                status,
                resumeFilename: resumeFilename ?? null,
                errorMessage: errorMessage ?? null,
                updatedAt: timestamp,
            },
        });

    return (await getApplication(provider, externalId))!;
}

export async function updateApplicationStatus(
    applicationId: number,
    status: ApplicationStatus,
    errorMessage?: string,
): Promise<void> {
    await initDb();
    await db
        .update(applications)
        .set({ status, errorMessage: errorMessage ?? null, updatedAt: now() })
        .where(eq(applications.id, applicationId));
}

export async function replaceQuestions(
    applicationId: number,
    questions: ApplicationQuestion[],
): Promise<void> {
    await initDb();
    await db
        .delete(applicationQuestions)
        .where(eq(applicationQuestions.applicationId, applicationId));

    if (questions.length === 0) return;

    await db.insert(applicationQuestions).values(
        questions.map((q) => ({
            applicationId,
            label: q.label,
            answer: q.answer ?? null,
            fieldType: q.fieldType ?? null,
            options: serializeOptions(q.options),
        })),
    );
}

export async function getQuestions(applicationId: number): Promise<ApplicationQuestion[]> {
    await initDb();
    const rows = await db
        .select()
        .from(applicationQuestions)
        .where(eq(applicationQuestions.applicationId, applicationId));
    return rows.map(questionFromRow);
}

export async function listJobIdsByStatus(status: string): Promise<number[]> {
    await initDb();
    const rows = await db
        .select({ jobId: applications.jobId })
        .from(applications)
        .where(eq(applications.status, status));
    return rows.map((r) => r.jobId);
}

export async function listFoundJobIds(): Promise<number[]> {
    await initDb();
    const rows = await db
        .select({ id: jobs.id })
        .from(jobs)
        .leftJoin(applications, eq(applications.jobId, jobs.id))
        .where(isNull(applications.id));
    return rows.map((r) => r.id);
}

export async function answerQuestions(
    applicationId: number,
    answers: Record<string, string>,
): Promise<void> {
    await initDb();
    for (const [label, answer] of Object.entries(answers)) {
        await db
            .update(applicationQuestions)
            .set({ answer })
            .where(
                and(
                    eq(applicationQuestions.applicationId, applicationId),
                    eq(applicationQuestions.label, label),
                ),
            );
    }
}

import { and, eq } from "drizzle-orm";
import { db, initDb } from "../../../db/client";
import {
    linkedinApplications,
    linkedinApplicationQuestions,
    type LinkedinApplicationRow,
    type LinkedinApplicationQuestionRow,
} from "../../../db/schema";
import type { ApplicationQuestion, ApplicationStatus } from "../../../providers/linkedin/services/types";

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
        return Array.isArray(parsed) ? parsed.filter((o): o is string => typeof o === "string") : [];
    } catch {
        return [];
    }
}

export function questionFromRow(row: LinkedinApplicationQuestionRow): ApplicationQuestion {
    return {
        label: row.label,
        answer: row.answer ?? undefined,
        fieldType: row.fieldType ?? undefined,
        options: parseOptions(row.options),
    };
}

export async function getApplication(linkedinJobId: string): Promise<LinkedinApplicationRow | null> {
    await initDb();
    const [row] = await db
        .select()
        .from(linkedinApplications)
        .where(eq(linkedinApplications.linkedinJobId, linkedinJobId))
        .limit(1);
    return row ?? null;
}

export async function upsertApplication(
    linkedinJobId: string,
    status: ApplicationStatus,
    resumeFilename?: string,
    errorMessage?: string,
): Promise<LinkedinApplicationRow> {
    await initDb();
    const timestamp = now();

    await db
        .insert(linkedinApplications)
        .values({
            linkedinJobId,
            status,
            resumeFilename: resumeFilename ?? null,
            errorMessage: errorMessage ?? null,
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        .onConflictDoUpdate({
            target: linkedinApplications.linkedinJobId,
            set: {
                status,
                resumeFilename: resumeFilename ?? null,
                errorMessage: errorMessage ?? null,
                updatedAt: timestamp,
            },
        });

    return (await getApplication(linkedinJobId))!;
}

export async function updateApplicationStatus(
    linkedinJobId: string,
    status: ApplicationStatus,
    errorMessage?: string,
): Promise<void> {
    await initDb();
    await db
        .update(linkedinApplications)
        .set({ status, errorMessage: errorMessage ?? null, updatedAt: now() })
        .where(eq(linkedinApplications.linkedinJobId, linkedinJobId));
}

export async function replaceQuestions(
    applicationId: number,
    questions: ApplicationQuestion[],
): Promise<void> {
    await initDb();
    await db
        .delete(linkedinApplicationQuestions)
        .where(eq(linkedinApplicationQuestions.applicationId, applicationId));

    if (questions.length === 0) return;

    await db.insert(linkedinApplicationQuestions).values(
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
        .from(linkedinApplicationQuestions)
        .where(eq(linkedinApplicationQuestions.applicationId, applicationId));
    return rows.map(questionFromRow);
}

export async function answerQuestions(
    applicationId: number,
    answers: Record<string, string>,
): Promise<void> {
    await initDb();
    for (const [label, answer] of Object.entries(answers)) {
        await db
            .update(linkedinApplicationQuestions)
            .set({ answer })
            .where(
                and(
                    eq(linkedinApplicationQuestions.applicationId, applicationId),
                    eq(linkedinApplicationQuestions.label, label),
                ),
            );
    }
}

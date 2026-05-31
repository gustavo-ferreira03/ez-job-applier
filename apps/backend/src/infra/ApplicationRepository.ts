import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobs, applications, applicationQuestions } from "../db/schema";
import type { IAppRepo, ApplicationRecord } from "../core/ports";
import type { ApplicationQuestion, ApplicationStatus } from "../core/types";

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

function toRecord(row: typeof applications.$inferSelect): ApplicationRecord {
    return {
        id: row.id,
        status: row.status as ApplicationStatus,
        resumeFilename: row.resumeFilename ?? null,
        errorMessage: row.errorMessage ?? null,
    };
}

export class ApplicationRepository implements IAppRepo {
    constructor(private db: Db) {}

    async get(provider: string, externalId: string): Promise<ApplicationRecord | null> {
        const [jobRow] = await this.db
            .select()
            .from(jobs)
            .where(and(eq(jobs.provider, provider), eq(jobs.externalId, externalId)))
            .limit(1);

        if (!jobRow) return null;

        const [row] = await this.db
            .select()
            .from(applications)
            .where(eq(applications.jobId, jobRow.id))
            .limit(1);

        return row ? toRecord(row) : null;
    }

    async upsert(
        provider: string,
        externalId: string,
        status: ApplicationStatus,
        resumeFilename?: string,
        errorMessage?: string,
    ): Promise<ApplicationRecord> {
        const [jobRow] = await this.db
            .select()
            .from(jobs)
            .where(and(eq(jobs.provider, provider), eq(jobs.externalId, externalId)))
            .limit(1);

        if (!jobRow) throw new Error(`Job not found: ${provider}/${externalId}`);

        const timestamp = new Date().toISOString();

        await this.db
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

        return (await this.get(provider, externalId))!;
    }

    async updateStatus(id: number, status: ApplicationStatus, errorMessage?: string): Promise<void> {
        await this.db
            .update(applications)
            .set({ status, errorMessage: errorMessage ?? null, updatedAt: new Date().toISOString() })
            .where(eq(applications.id, id));
    }

    async replaceQuestions(appId: number, questions: ApplicationQuestion[]): Promise<void> {
        await this.db
            .delete(applicationQuestions)
            .where(eq(applicationQuestions.applicationId, appId));

        if (questions.length === 0) return;

        await this.db.insert(applicationQuestions).values(
            questions.map((q) => ({
                applicationId: appId,
                label: q.label,
                answer: q.answer ?? null,
                fieldType: q.fieldType ?? null,
                options: serializeOptions(q.options),
            })),
        );
    }

    async getQuestions(appId: number): Promise<ApplicationQuestion[]> {
        const rows = await this.db
            .select()
            .from(applicationQuestions)
            .where(eq(applicationQuestions.applicationId, appId));

        return rows.map((row) => ({
            label: row.label,
            answer: row.answer ?? undefined,
            fieldType: (row.fieldType ?? undefined) as ApplicationQuestion["fieldType"],
            options: parseOptions(row.options),
        }));
    }

    async answerQuestions(appId: number, answers: Record<string, string>): Promise<void> {
        for (const [label, answer] of Object.entries(answers)) {
            await this.db
                .update(applicationQuestions)
                .set({ answer })
                .where(
                    and(
                        eq(applicationQuestions.applicationId, appId),
                        eq(applicationQuestions.label, label),
                    ),
                );
        }
    }

    async listIdsByStatus(status: ApplicationStatus): Promise<number[]> {
        const rows = await this.db
            .select({ jobId: applications.jobId })
            .from(applications)
            .where(eq(applications.status, status));
        return rows.map((r) => r.jobId);
    }

    async listFoundJobIds(): Promise<number[]> {
        const rows = await this.db
            .select({ id: jobs.id })
            .from(jobs)
            .leftJoin(applications, eq(applications.jobId, jobs.id))
            .where(isNull(applications.id));
        return rows.map((r) => r.id);
    }

}

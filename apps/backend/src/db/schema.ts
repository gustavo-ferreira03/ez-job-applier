import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const jobs = sqliteTable(
    "jobs",
    {
        id: integer("id").primaryKey({ autoIncrement: true }),
        provider: text("provider").notNull(),
        externalId: text("external_id").notNull(),
        title: text("title").notNull(),
        company: text("company").notNull(),
        location: text("location").notNull(),
        url: text("url").notNull(),
        preferences: text("preferences").notNull().default("[]"),
        skills: text("skills").notNull().default("[]"),
        about: text("about"),
        applicationUrl: text("application_url"),
        createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
        updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    },
    (t) => [uniqueIndex("jobs_provider_external_id_unique").on(t.provider, t.externalId)],
);

export const applications = sqliteTable("applications", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: integer("job_id").notNull().unique(),
    status: text("status").notNull().default("FOUND"),
    resumeFilename: text("resume_filename"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const applicationQuestions = sqliteTable("application_questions", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id").notNull(),
    label: text("label").notNull(),
    answer: text("answer"),
    fieldType: text("field_type"),
    options: text("options").notNull().default("[]"),
});

export type JobRow = typeof jobs.$inferSelect;
export type NewJobRow = typeof jobs.$inferInsert;

export type ApplicationRow = typeof applications.$inferSelect;
export type NewApplicationRow = typeof applications.$inferInsert;

export type ApplicationQuestionRow = typeof applicationQuestions.$inferSelect;
export type NewApplicationQuestionRow = typeof applicationQuestions.$inferInsert;

export const discoveries = sqliteTable("discoveries", {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    config: text("config").notNull(),
    status: text("status").notNull().default("running"),
    discovered: integer("discovered").notNull().default(0),
    startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    finishedAt: text("finished_at"),
    errorMessage: text("error_message"),
});

export type DiscoveryRow = typeof discoveries.$inferSelect;
export type NewDiscoveryRow = typeof discoveries.$inferInsert;

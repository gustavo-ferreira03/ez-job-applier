import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const linkedinJobs = sqliteTable("linkedin_jobs", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    linkedinJobId: text("linkedin_job_id").notNull().unique(),
    title: text("title").notNull(),
    company: text("company").notNull(),
    location: text("location").notNull(),
    url: text("url").notNull(),
    easyApply: integer("easy_apply", { mode: "boolean" })
        .notNull()
        .default(false),
    preferences: text("preferences").notNull().default("[]"),
    skills: text("skills").notNull().default("[]"),
    about: text("about"),
    applicationUrl: text("application_url"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// Possible values: FOUND | NEEDS_INPUT | READY_FOR_REVIEW | SUBMITTED | SKIPPED | FAILED | EXTERNAL
export const linkedinApplications = sqliteTable("linkedin_applications", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    linkedinJobId: text("linkedin_job_id").notNull().unique(),
    status: text("status").notNull().default("FOUND"),
    resumeFilename: text("resume_filename"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const linkedinApplicationQuestions = sqliteTable("linkedin_application_questions", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    applicationId: integer("application_id").notNull(),
    label: text("label").notNull(),
    answer: text("answer"),
    fieldType: text("field_type"),
    options: text("options").notNull().default("[]"),
});

export type LinkedinJobRow = typeof linkedinJobs.$inferSelect;
export type NewLinkedinJobRow = typeof linkedinJobs.$inferInsert;

export type LinkedinApplicationRow = typeof linkedinApplications.$inferSelect;
export type NewLinkedinApplicationRow = typeof linkedinApplications.$inferInsert;

export type LinkedinApplicationQuestionRow = typeof linkedinApplicationQuestions.$inferSelect;
export type NewLinkedinApplicationQuestionRow = typeof linkedinApplicationQuestions.$inferInsert;

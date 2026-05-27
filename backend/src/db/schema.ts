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

export type LinkedinJobRow = typeof linkedinJobs.$inferSelect;
export type NewLinkedinJobRow = typeof linkedinJobs.$inferInsert;

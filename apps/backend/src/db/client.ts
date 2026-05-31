import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import fs from "node:fs/promises";
import path from "node:path";
import * as schema from "./schema";

const databaseUrl = process.env.DB_FILE_NAME || "file:storage/applier.db";
const filePath = databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : databaseUrl;

if (!databaseUrl.startsWith("file:") && !databaseUrl.startsWith("libsql:")) {
    throw new Error("DB_FILE_NAME must be a file: or libsql: URL");
}

const client = createClient({ url: databaseUrl });

export const db = drizzle(client, { schema });

export type Db = typeof db;

let initPromise: Promise<void> | null = null;

export function initDb(): Promise<void> {
    initPromise ??= initialize();
    return initPromise;
}

async function initialize(): Promise<void> {
    if (databaseUrl.startsWith("file:")) {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
    }

    await client.execute("PRAGMA journal_mode = WAL");

    await client.execute(`
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            external_id TEXT NOT NULL,
            title TEXT NOT NULL,
            company TEXT NOT NULL,
            location TEXT NOT NULL,
            url TEXT NOT NULL,
            preferences TEXT NOT NULL DEFAULT '[]',
            skills TEXT NOT NULL DEFAULT '[]',
            about TEXT,
            application_url TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await client.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS jobs_provider_external_id_unique
        ON jobs (provider, external_id)
    `);

    await client.execute(`
        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id INTEGER NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'FOUND',
            resume_filename TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await client.execute(`
        CREATE TABLE IF NOT EXISTS application_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            application_id INTEGER NOT NULL,
            label TEXT NOT NULL,
            answer TEXT,
            field_type TEXT,
            options TEXT NOT NULL DEFAULT '[]'
        )
    `);

    await client.execute(`
        CREATE TABLE IF NOT EXISTS executions (
            id TEXT PRIMARY KEY,
            config TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'running',
            discovered INTEGER NOT NULL DEFAULT 0,
            cycle_max_ms INTEGER NOT NULL DEFAULT 3600000,
            interval_ms INTEGER NOT NULL DEFAULT 14400000,
            next_run_at TEXT,
            started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            finished_at TEXT,
            error_message TEXT
        )
    `);

    const hasDiscoveries = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='discoveries'"
    );
    if (hasDiscoveries.rows.length > 0) {
        await client.execute(`INSERT OR IGNORE INTO executions (id, config, status, discovered, started_at, finished_at, error_message)
            SELECT id, config, status, discovered, started_at, finished_at, error_message FROM discoveries`);
        await client.execute(`DROP TABLE discoveries`);
    }

    // Idempotent migrations for executions columns
    for (const col of [
        "cycle_max_ms INTEGER NOT NULL DEFAULT 3600000",
        "interval_ms INTEGER NOT NULL DEFAULT 14400000",
        "next_run_at TEXT",
    ]) {
        try { await client.execute(`ALTER TABLE executions ADD COLUMN ${col}`); } catch { /* exists */ }
    }

    // On restart: mark running executions as failed (they'll be re-started by auto-resume)
    await client.execute(`
        UPDATE executions
        SET status = 'failed', error_message = 'Server restarted', finished_at = CURRENT_TIMESTAMP
        WHERE status IN ('running', 'waiting')
    `);

    // Migrate data from legacy linkedin_jobs table
    const oldJobs = await client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'linkedin_jobs'",
    );
    if (oldJobs.rows.length > 0) {
        await client.execute(`
            INSERT OR IGNORE INTO jobs
                (provider, external_id, title, company, location, url,
                 preferences, skills, about, application_url, created_at, updated_at)
            SELECT
                'linkedin', linkedin_job_id, title, company, location, url,
                preferences, skills, about, application_url, created_at, updated_at
            FROM linkedin_jobs
        `);
    }

    // Migrate data from legacy linkedin_applications table
    const oldApps = await client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'linkedin_applications'",
    );
    if (oldApps.rows.length > 0) {
        await client.execute(`
            INSERT OR IGNORE INTO applications
                (job_id, status, resume_filename, error_message, created_at, updated_at)
            SELECT
                j.id, la.status, la.resume_filename, la.error_message,
                la.created_at, la.updated_at
            FROM linkedin_applications la
            JOIN jobs j ON j.provider = 'linkedin' AND j.external_id = la.linkedin_job_id
        `);
    }

    // Migrate data from legacy linkedin_application_questions table
    const oldQuestions = await client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'linkedin_application_questions'",
    );
    if (oldQuestions.rows.length > 0) {
        await client.execute(`
            INSERT OR IGNORE INTO application_questions
                (application_id, label, answer, field_type, options)
            SELECT
                a.id, laq.label, laq.answer, laq.field_type, laq.options
            FROM linkedin_application_questions laq
            JOIN linkedin_applications la ON la.id = laq.application_id
            JOIN jobs j ON j.provider = 'linkedin' AND j.external_id = la.linkedin_job_id
            JOIN applications a ON a.job_id = j.id
        `);
    }
}

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
        CREATE TABLE IF NOT EXISTS linkedin_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            linkedin_job_id TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            company TEXT NOT NULL,
            location TEXT NOT NULL,
            url TEXT NOT NULL,
            easy_apply INTEGER NOT NULL DEFAULT 0,
            preferences TEXT NOT NULL DEFAULT '[]',
            skills TEXT NOT NULL DEFAULT '[]',
            about TEXT,
            application_url TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const existingJobsTable = await client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jobs'",
    );
    if (existingJobsTable.rows.length > 0) {
        await client.execute(`
            INSERT OR IGNORE INTO linkedin_jobs (
                linkedin_job_id, title, company, location, url, easy_apply,
                preferences, skills, about, application_url, created_at, updated_at
            )
            SELECT
                job_id, title, company, location, url, easy_apply,
                preferences, skills, about, application_url, created_at, updated_at
            FROM jobs
        `);
    }
}

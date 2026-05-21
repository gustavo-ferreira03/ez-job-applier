import json
import sqlite3
from datetime import datetime


DB_PATH = "jobs.db"


def now():
    return datetime.utcnow().isoformat(timespec="seconds")


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                title TEXT,
                company TEXT,
                location TEXT,
                url TEXT,
                easy_apply INTEGER,
                preferences TEXT,
                skills TEXT,
                about TEXT,
                application_url TEXT,
                status TEXT DEFAULT 'pending',
                error_message TEXT,
                created_at TEXT,
                updated_at TEXT
            )
            """
        )


def save_jobs(jobs):
    timestamp = now()
    with connect() as conn:
        for job in jobs:
            conn.execute(
                """
                INSERT INTO jobs (
                    job_id, title, company, location, url, easy_apply,
                    preferences, skills, about, application_url,
                    status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    title = excluded.title,
                    company = excluded.company,
                    location = excluded.location,
                    url = excluded.url,
                    easy_apply = excluded.easy_apply,
                    preferences = excluded.preferences,
                    skills = excluded.skills,
                    about = excluded.about,
                    application_url = excluded.application_url,
                    updated_at = excluded.updated_at
                """,
                (
                    job["job_id"],
                    job.get("title"),
                    job.get("company"),
                    job.get("location"),
                    job.get("url"),
                    int(job.get("easy_apply", False)),
                    json.dumps(job.get("preferences", []), ensure_ascii=False),
                    json.dumps(job.get("skills", []), ensure_ascii=False),
                    job.get("about"),
                    job.get("application_url"),
                    timestamp,
                    timestamp,
                ),
            )


def pending_easy_apply_jobs():
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM jobs
            WHERE easy_apply = 1 AND status IN ('pending', 'needs_input', 'ready_to_submit')
            ORDER BY created_at
            """
        ).fetchall()
    return [dict(row) for row in rows]


def job_summary():
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT job_id, title, company, location, easy_apply, status, error_message, updated_at
            FROM jobs
            ORDER BY updated_at DESC
            LIMIT 100
            """
        ).fetchall()
    return [dict(row) for row in rows]


def update_status(job_id, status, error_message=None):
    with connect() as conn:
        conn.execute(
            """
            UPDATE jobs
            SET status = ?, error_message = ?, updated_at = ?
            WHERE job_id = ?
            """,
            (status, error_message, now(), job_id),
        )

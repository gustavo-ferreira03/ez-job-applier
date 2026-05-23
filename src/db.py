import json
import sqlite3
from datetime import datetime
from pathlib import Path

from models import Application, ApplicationQuestion, ApplicationStatus, Job


class Database:
    def __init__(self, path="jobs.db"):
        self.path = Path(path)

    def connect(self):
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def init(self):
        with self.connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            self._assert_no_legacy_schema(conn)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                    job_id TEXT PRIMARY KEY,
                    title TEXT,
                    company TEXT,
                    location TEXT,
                    url TEXT,
                    easy_apply INTEGER NOT NULL DEFAULT 0,
                    preferences TEXT,
                    skills TEXT,
                    about TEXT,
                    application_url TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS applications (
                    application_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id TEXT NOT NULL UNIQUE REFERENCES jobs(job_id) ON DELETE CASCADE,
                    status TEXT NOT NULL,
                    submit_approved INTEGER NOT NULL DEFAULT 0,
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS application_questions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    application_id INTEGER NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
                    label TEXT NOT NULL,
                    answer TEXT,
                    field_type TEXT,
                    options_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(application_id, label)
                )
                """
            )

    def _assert_no_legacy_schema(self, conn):
        row = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jobs'").fetchone()
        if not row:
            return
        columns = {column["name"] for column in conn.execute("PRAGMA table_info(jobs)").fetchall()}
        if "status" in columns or "applied_answers" in columns:
            raise RuntimeError("Legacy jobs table detected. Delete jobs.db before running the new schema.")

    def save_jobs(self, jobs: list[Job]):
        timestamp = now()
        with self.connect() as conn:
            for job in jobs:
                conn.execute(
                    """
                    INSERT INTO jobs (
                        job_id, title, company, location, url, easy_apply,
                        preferences, skills, about, application_url, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        job.job_id,
                        job.title,
                        job.company,
                        job.location,
                        job.url,
                        int(job.easy_apply),
                        json.dumps(job.preferences, ensure_ascii=False),
                        json.dumps(job.skills, ensure_ascii=False),
                        job.about,
                        job.application_url,
                        timestamp,
                        timestamp,
                    ),
                )

    def ensure_applications_for_easy_apply_jobs(self, jobs: list[Job]) -> list[Application]:
        applications = []
        for job in jobs:
            if job.easy_apply:
                applications.append(self.ensure_application_for_job(job.job_id))
        return applications

    def ensure_application_for_job(self, job_id: str) -> Application:
        timestamp = now()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO applications (job_id, status, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                (job_id, ApplicationStatus.FOUND.value, timestamp, timestamp),
            )
            row = conn.execute("SELECT * FROM applications WHERE job_id = ?", (job_id,)).fetchone()
        return application_from_row(row)

    def get_job(self, job_id: str) -> dict | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
            if not row:
                return None
            job = dict(row)
            application = conn.execute("SELECT * FROM applications WHERE job_id = ?", (job_id,)).fetchone()
        return hydrate_job(job, application)

    def get_application(self, application_id: int) -> Application | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM applications WHERE application_id = ?", (application_id,)).fetchone()
        return application_from_row(row) if row else None

    def get_job_for_application(self, application: Application) -> Job | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (application.job_id,)).fetchone()
        return job_from_row(row) if row else None

    def job_summary(self):
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT
                    j.job_id, j.title, j.company, j.location, j.url, j.easy_apply,
                    j.created_at, j.updated_at,
                    a.application_id, a.status, a.submit_approved, a.error_message,
                    a.updated_at AS application_updated_at
                FROM jobs j
                LEFT JOIN applications a ON a.job_id = j.job_id
                ORDER BY COALESCE(a.updated_at, j.updated_at) DESC
                LIMIT 200
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def next_task(self) -> Application | None:
        with self.connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM applications a
                WHERE a.status = ?
                  AND NOT EXISTS (
                    SELECT 1 FROM application_questions q
                    WHERE q.application_id = a.application_id
                      AND (q.answer IS NULL OR q.answer = '')
                  )
                ORDER BY a.updated_at
                LIMIT 1
                """,
                (ApplicationStatus.NEEDS_ANSWERS.value,),
            ).fetchone()
            if row:
                return application_from_row(row)

            row = conn.execute(
                """
                SELECT * FROM applications
                WHERE status = ? AND submit_approved = 1
                ORDER BY updated_at
                LIMIT 1
                """,
                (ApplicationStatus.READY_FOR_REVIEW.value,),
            ).fetchone()
            if row:
                return application_from_row(row)

            row = conn.execute(
                """
                SELECT * FROM applications
                WHERE status = ?
                ORDER BY updated_at
                LIMIT 1
                """,
                (ApplicationStatus.FOUND.value,),
            ).fetchone()
        return application_from_row(row) if row else None

    def set_application_status(self, application_id: int, status: ApplicationStatus, error_message: str | None = None):
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE applications
                SET status = ?, submit_approved = 0, error_message = ?, updated_at = ?
                WHERE application_id = ?
                """,
                (status.value, error_message, now(), application_id),
            )

    def approve_application_submit(self, application_id: int):
        with self.connect() as conn:
            conn.execute(
                """
                UPDATE applications
                SET submit_approved = 1, updated_at = ?
                WHERE application_id = ? AND status = ?
                """,
                (now(), application_id, ApplicationStatus.READY_FOR_REVIEW.value),
            )

    def skip_application(self, application_id: int):
        timestamp = now()
        with self.connect() as conn:
            conn.execute("DELETE FROM application_questions WHERE application_id = ?", (application_id,))
            conn.execute(
                """
                UPDATE applications
                SET status = ?, submit_approved = 0, error_message = NULL, updated_at = ?
                WHERE application_id = ?
                """,
                (ApplicationStatus.SKIPPED.value, timestamp, application_id),
            )

    def list_questions(self, application_id: int, unanswered_only=False) -> list[ApplicationQuestion]:
        with self.connect() as conn:
            query = "SELECT * FROM application_questions WHERE application_id = ? ORDER BY id"
            if unanswered_only:
                query = "SELECT * FROM application_questions WHERE application_id = ? AND (answer IS NULL OR answer = '') ORDER BY id"
            rows = conn.execute(query, (application_id,)).fetchall()
        return [question_from_row(row) for row in rows]

    def upsert_questions(self, application_id: int, questions: list[ApplicationQuestion]):
        timestamp = now()
        with self.connect() as conn:
            for question in questions:
                conn.execute(
                    """
                    INSERT INTO application_questions (
                        application_id, label, answer, field_type, options_json, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(application_id, label) DO UPDATE SET
                        answer = COALESCE(excluded.answer, application_questions.answer),
                        field_type = excluded.field_type,
                        options_json = excluded.options_json,
                        updated_at = excluded.updated_at
                    """,
                    (
                        application_id,
                        question.label,
                        question.answer,
                        question.field_type,
                        json.dumps(question.options, ensure_ascii=False),
                        timestamp,
                        timestamp,
                    ),
                )

    def answer_questions(self, application_id: int, answers: dict[str, str]):
        timestamp = now()
        with self.connect() as conn:
            for label, answer in answers.items():
                conn.execute(
                    """
                    UPDATE application_questions
                    SET answer = ?, updated_at = ?
                    WHERE application_id = ? AND label = ?
                    """,
                    (answer, timestamp, application_id, label),
                )
            conn.execute(
                "UPDATE applications SET updated_at = ? WHERE application_id = ?",
                (timestamp, application_id),
            )

    def pending_question_applications(self):
        return self._applications_with_questions(ApplicationStatus.NEEDS_ANSWERS)

    def ready_for_review_applications(self):
        return self._applications_with_questions(ApplicationStatus.READY_FOR_REVIEW)

    def _applications_with_questions(self, status: ApplicationStatus):
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT a.*, j.title, j.company, j.location
                FROM applications a
                JOIN jobs j ON j.job_id = a.job_id
                WHERE a.status = ?
                ORDER BY a.updated_at
                """,
                (status.value,),
            ).fetchall()
        items = []
        for row in rows:
            item = dict(row)
            unanswered_only = status == ApplicationStatus.NEEDS_ANSWERS
            item["questions"] = [q.model_dump() for q in self.list_questions(row["application_id"], unanswered_only=unanswered_only)]
            items.append(item)
        return items


def now():
    return datetime.utcnow().isoformat(timespec="seconds")


def job_from_row(row) -> Job:
    data = dict(row)
    for field in ("preferences", "skills"):
        data[field] = json.loads(data[field]) if data.get(field) else []
    data["easy_apply"] = bool(data.get("easy_apply"))
    data = {key: data[key] for key in Job.model_fields if key in data}
    return Job.model_validate(data)


def application_from_row(row) -> Application:
    data = dict(row)
    data["submit_approved"] = bool(data.get("submit_approved"))
    return Application.model_validate(data)


def question_from_row(row) -> ApplicationQuestion:
    data = dict(row)
    data["options"] = json.loads(data.pop("options_json")) if data.get("options_json") else []
    data = {key: data[key] for key in ApplicationQuestion.model_fields if key in data}
    return ApplicationQuestion.model_validate(data)


def hydrate_job(job, application):
    for field in ("preferences", "skills"):
        job[field] = json.loads(job[field]) if job.get(field) else []
    job["easy_apply"] = bool(job.get("easy_apply"))
    if application:
        job["application_id"] = application["application_id"]
        job["status"] = application["status"]
        job["submit_approved"] = bool(application["submit_approved"])
        job["error_message"] = application["error_message"]
        job["application_updated_at"] = application["updated_at"]
    return job

# AGENTS.md

## Project Shape
- Python 3.10+ script project; source lives in `src/`.
- Server entry point is `python src/server.py`; `src/main.py` remains a CLI/dev runner.
- `src/linkedin_client.py` owns shared LinkedIn login/session handling; `src/job_collector.py` scrapes jobs; `src/job_applier.py` owns Easy Apply automation; `src/runner.py` orchestrates server-triggered runs.
- Keep entry points thin: server routes should delegate to `RunManager`; CLI should remain orchestration only.

## Setup And Commands
- Dependencies are declared in `pyproject.toml`; this repo uses `uv.lock` and `[tool.uv] package = false`.
- Syntax check: `python -m py_compile src/main.py src/server.py src/runner.py src/events.py src/waiters.py src/linkedin_client.py src/job_collector.py src/job_applier.py src/db.py src/applicant_profile.py`.
- Run server UI: `python src/server.py` from the repo root, then open `http://127.0.0.1:8000`.
- Run CLI/dev flow: `python src/main.py` from the repo root so `linkedin_session.json` and `jobs.json` resolve in the expected location.

## Git Workflow
- Use Conventional Commits for commit messages, e.g. `feat: add application URL capture` or `docs: update agent instructions`.

## Runtime Gotchas
- LinkedIn auth is persisted in `linkedin_session.json`; if missing/expired, the server opens a headed browser for login, saves the session, then continues headless.
- Browser automation is headless by default; headed mode is for login only unless explicitly requested.
- `jobs.json`, `jobs.db`, `profile.json`, `linkedin_session.json`, `.venv/`, `.agents/`, and `skills-lock.json` are ignored by git.
- For faster tests, pass `max_jobs` through `JobCollector.collect_jobs(...)`; avoid collecting all jobs unless needed.

## Scraper Behavior
- Job discovery first scrolls the LinkedIn results list to load IDs, then extracts jobs by `data-occludable-job-id`; preserve this two-phase flow to avoid virtualized-list issues.
- `preferences` and `skills` come from LinkedIn's "Preferences and skills match" modal, not from the job description text.
- `application_url` should be captured by actually opening the external application control for non-Easy Apply jobs; do not infer it from URLs inside `about`.
- Easy Apply jobs should keep `application_url` as `None`.
- Easy Apply automation asks for missing answers and submit approval through the local server UI, not terminal prompts.
- A user refusal should update the job status to `skipped`.
- Unknown Easy Apply answers are saved in `profile.json` using normalized question keys.

## Language
- LinkedIn language is forced to English via `set_language_english()`, called on every session start.
- All locators (button names, dialog names, text filters) use English strings.

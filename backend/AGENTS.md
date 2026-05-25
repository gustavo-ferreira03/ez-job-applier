# AGENTS.md

## Project Shape
- Python 3.10+ script project; source lives in `src/`.
- Server entry point is `python src/server.py`.
- `src/db.py` owns persistence through the `Database` class.
- `src/sources/` owns job discovery sources; `src/appliers/` owns application execution.
- `src/application_worker.py` owns the state-oriented application worker.
- Keep routes thin: server routes should validate inputs, call sources/DB, and let the worker process applications.

## Setup And Commands
- Dependencies are declared in `pyproject.toml`; this repo uses `uv.lock` and `[tool.uv] package = false`.
- Syntax check: `python -m py_compile src/server.py src/models.py src/db.py src/events.py src/application_worker.py src/sources/base.py src/sources/linkedin.py src/appliers/base.py src/appliers/linkedin_easy_apply.py`.
- Run server UI: `python src/server.py` from `backend/`, then open `http://127.0.0.1:8000`.

## Git Workflow
- Use Conventional Commits for commit messages, e.g. `feat: add application URL capture` or `docs: update agent instructions`.

## Runtime Gotchas
- LinkedIn auth is persisted in `linkedin_session.json`; if missing/expired, the server opens a headed browser for login, saves the session, then continues headless.
- Browser automation is headless by default; headed mode is for login only unless explicitly requested.
- Runtime JSON/DB files, `linkedin_session.json`, `.venv/`, `.agents/`, and `skills-lock.json` are ignored by git.
- The current DB schema is clean and does not support legacy `jobs.status`; delete `jobs.db` if a legacy schema is detected.

## Scraper Behavior
- Job discovery first scrolls the LinkedIn results list to load IDs, then extracts jobs by `data-occludable-job-id`; preserve this two-phase flow to avoid virtualized-list issues.
- `preferences` and `skills` come from LinkedIn's "Preferences and skills match" modal, not from the job description text.
- `application_url` should be captured by actually opening the external application control for non-Easy Apply jobs; do not infer it from URLs inside `about`.
- Easy Apply jobs should keep `application_url` as `None`.
- Easy Apply applications are state-driven through `applications.status`.
- Missing questions are persisted in `application_questions` and answered through the local server UI.
- A user refusal marks the application `SKIPPED` and deletes that application's questions.

## Language
- LinkedIn language is forced to English via `set_language_english()`, called on every session start.
- All locators (button names, dialog names, text filters) use English strings.

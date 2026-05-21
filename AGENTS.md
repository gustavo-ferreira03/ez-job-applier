# AGENTS.md

## Project Shape
- Python 3.10+ script project; source lives in `src/`.
- Entry point is `python src/main.py`; it writes `jobs.json` in the repo root.
- `src/linkedin_client.py` owns all LinkedIn/Playwright automation; keep `src/main.py` as orchestration only.

## Setup And Commands
- Dependencies are declared in `pyproject.toml`; this repo uses `uv.lock` and `[tool.uv] package = false`.
- Syntax check: `python -m py_compile src/main.py src/linkedin_client.py`.
- Run scraper: `python src/main.py` from the repo root so `linkedin_session.json` and `jobs.json` resolve in the expected location.

## Git Workflow
- Use Conventional Commits for commit messages, e.g. `feat: add application URL capture` or `docs: update agent instructions`.

## Runtime Gotchas
- LinkedIn auth is persisted in `linkedin_session.json`; if missing/expired, the script opens manual login and waits for ENTER.
- Browser is intentionally headed by default (`headless=False`); do not make Playwright/headful changes casually.
- `jobs.json`, `jobs.db`, `linkedin_session.json`, `.venv/`, `.agents/`, and `skills-lock.json` are ignored by git.
- For faster tests, pass `max_jobs` through `LinkedInClient.collect_jobs(...)`; avoid collecting all jobs unless needed.

## Scraper Behavior
- Job discovery first scrolls the LinkedIn results list to load IDs, then extracts jobs by `data-occludable-job-id`; preserve this two-phase flow to avoid virtualized-list issues.
- `preferences` and `skills` come from LinkedIn's "Preferences and skills match" modal, not from the job description text.
- `application_url` should be captured by actually opening the external application control for non-Easy Apply jobs; do not infer it from URLs inside `about`.
- Easy Apply jobs should keep `application_url` as `None`.

## Language
- LinkedIn language is forced to English via `set_language_english()`, called on every session start.
- All locators (button names, dialog names, text filters) use English strings.

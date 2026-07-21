<!-- prettier-ignore -->
<div align="center">

<img src="./apps/frontend/static/brand/logo.svg" alt="EZJobApplier logo" width="96" height="96" />

# EZJobApplier

_A local control room for finding jobs, tailoring resumes, and supervising applications._

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.19-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Svelte](https://img.shields.io/badge/Svelte_5-ff3e00?style=flat-square&logo=svelte&logoColor=white)](https://svelte.dev/)
[![pnpm](https://img.shields.io/badge/pnpm-10.30.1-f69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ed?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](./LICENSE)

[Overview](#overview) | [Quick start](#quick-start) | [How it works](#how-it-works) | [Configuration](#configuration) | [Development](#development) | [Troubleshooting](#troubleshooting)

</div>

EZJobApplier runs repeatable LinkedIn searches and puts every result in a reviewable Kanban pipeline. It can inspect Easy Apply forms, collect unanswered questions, tailor resumes, and process external ATS links with a browser agent. You keep control of approvals and can watch browser sessions through noVNC.

> [!WARNING]
> EZJobApplier can submit real applications and stores LinkedIn sessions, provider credentials, resumes, and application answers on disk. It has no built-in user authentication. Run it on a trusted machine, don't expose ports `3000` or `3001` directly to the internet, and review every generated answer and document before approval.

## Overview

### What it does

- **Tracks jobs in one pipeline:** Found, Needs Input, Review, Submitted, Failed, and Rejected.
- **Discovers LinkedIn jobs:** runs saved searches, skips known jobs, and applies static or optional AI filters.
- **Inspects Easy Apply forms:** uploads a resume, records required questions, and closes the draft without submitting it.
- **Handles external ATS links:** a supervised LLM agent fills forms in an isolated browser with live noVNC access and chat handoff.
- **Manages resumes:** stores PDF resumes, structured YAML masters, per-job variants, Typst templates, and optional GitHub imports.
- **Automates on your terms:** supports schedules, repeated cycles, Telegram prompts, auto-answering, and configurable concurrency.

### Stack

| Area               | Technology                                            | Responsibility                                        |
| ------------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| Web app            | SvelteKit, Svelte 5, Tailwind CSS 4                   | Pipeline, settings, review flows, live browser client |
| API                | Hono, Zod OpenAPI, WebSockets                         | REST endpoints, execution workers, VNC bridge         |
| Data               | SQLite/libSQL, Drizzle ORM                            | Jobs, applications, questions, executions, settings   |
| Browser automation | Cloak Browser, Playwright Core, Playwright MCP, noVNC | LinkedIn discovery, Easy Apply, external ATS forms    |
| AI and documents   | Pi AI, Pi Coding Agent, `resume-ci`, Typst            | Filtering, answers, resume tailoring, browser agent   |
| Notifications      | Grammy                                                | Telegram questions, review prompts, and approvals     |

The repository is a pnpm workspace with two applications:

```text
.
|-- apps/
|   |-- backend/       # Hono API, workers, Drizzle schema, providers
|   `-- frontend/      # SvelteKit dashboard and noVNC client
|-- docker-compose.yml
|-- Dockerfile
|-- entrypoint.sh
`-- pnpm-workspace.yaml
```

## Quick start

Docker supplies Chromium dependencies, Cloak Browser, Xvfb, x11vnc, Typst, and database migrations. It is the shortest path to a working installation.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Compose
- A LinkedIn account
- An AI provider credential only if you enable AI filtering, generated answers, resume tailoring, or external ATS automation

### Run with Docker

```bash
git clone https://github.com/gustavo-ferreira03/ez-job-applier.git
cd ez-job-applier
docker compose up --build
```

The frontend defaults to `http://localhost:3000` for the API. To point it elsewhere, copy `.env.example` to `.env` and set `PUBLIC_API_URL`.

Open `http://localhost:3001`. The API and its reference page are available at `http://localhost:3000` and `http://localhost:3000/docs`.

Runtime files persist in the `app-storage` Docker volume. Stop the service with `docker compose down`; add `-v` only when you intend to delete the database, resumes, and saved sessions.

### First run

1. Open **Settings > General**, enter one or more search keywords, and upload a PDF resume.
2. Mark one resume as the default. The app won't start an execution without it.
3. Choose location, work model, experience level, job type, and any block lists.
4. Sign in to LinkedIn through the live browser when prompted, then click **Start execution**.
5. Review discovered jobs, answer missing fields, inspect tailored documents, and approve only the applications you want sent.

## How it works

### LinkedIn and Easy Apply

Each execution cycle searches LinkedIn for the configured keywords, ignores jobs already stored in SQLite, and runs block-list checks before optional AI filtering. Easy Apply jobs are opened and inspected, but the discovery pass does not click the final submit button.

```text
FOUND
  |-- rejected by filters -------------> REJECTED
  |-- missing required answers --------> NEEDS_INPUT
  `-- form ready ----------------------> READY_FOR_REVIEW

NEEDS_INPUT -- all answers saved ------> READY_FOR_REVIEW
READY_FOR_REVIEW -- user approves -----> APPROVED
APPROVED -- processed by active cycle -> SUBMITTED or FAILED
```

> [!NOTE]
> **Submit application** queues an Easy Apply job as `APPROVED`. An active execution cycle must reopen the form and perform the real submission. If execution is stopped, the job remains queued.

### External ATS applications

When a LinkedIn listing points to another ATS and **External apply** is enabled, EZJobApplier opens an isolated browser session for the agent. The application modal lets you watch or control that browser, answer questions, and steer the agent through chat. Sessions waiting for input can hibernate and restore their browser state when reopened.

Disable **Easy Apply only** in the LinkedIn search settings if you want discovery to include listings that lead to external application sites.

The agent receives instructions to ask before final submission, but that instruction is not a security boundary around browser clicks. Keep the session visible for sensitive applications and verify the confirmation page yourself.

### Resumes and AI

The default PDF is used for ordinary Easy Apply jobs. Structured master resumes add extraction, per-job tailoring, Typst PDF previews, and optional sync from a GitHub repository containing `resumes/*.yml` and `templates/*.typ`.

> [!CAUTION]
> Tailoring flexibility **Maximum** permits the model to introduce technologies, responsibilities, and rewritten experience that are absent from the master resume. Use Conservative or Balanced for factual applications, then read the generated PDF before approval.

Provider keys and supported OAuth sessions are configured under **Settings > AI**. They are saved locally in `apps/backend/storage/pi-auth.json`, not read from provider-specific environment variables.

## Local installation

Running outside Docker requires more system packages because visible browser sessions use a Linux X11/VNC stack.

### Prerequisites

- [Node.js](https://nodejs.org/) 22.19.0 or newer
- [pnpm](https://pnpm.io/) 10.30.1
- [Typst](https://github.com/typst/typst) for tailored PDF generation
- Chromium dependencies, Xvfb, x11vnc, and `pkill`/procps for visible browser sessions on Linux

Install the workspace and browser assets:

```bash
pnpm install
mkdir -p apps/backend/storage
pnpm -C apps/backend db:migrate
pnpm -C apps/backend exec playwright-core install chromium
pnpm -C apps/backend exec cloakbrowser install
```

On Linux, Playwright can install its Chromium system packages:

```bash
pnpm -C apps/backend exec playwright-core install-deps chromium
```

Create `apps/frontend/.env` (copy the provided example):

```bash
cp apps/frontend/.env.example apps/frontend/.env
```

```dotenv
PUBLIC_API_URL=http://localhost:3000
```

Start both applications from the repository root:

```bash
pnpm dev
```

The backend listens on `http://localhost:3000`; Vite usually serves the frontend at `http://localhost:5173`.

## Configuration

Most configuration lives in the web app and persists in SQLite.

| Settings area | Controls                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------- |
| General       | Search keywords, location, job filters, block lists, PDF resumes, structured masters, GitHub sync |
| AI            | Provider authentication, model, filtering, auto-answering, tailoring, external ATS agent          |
| Advanced      | Browser visibility, locale, cycle timing, schedule, timezone, concurrency, Telegram pairing       |

Schedules restrict an execution that has already started; they don't launch the process on their own.

### Environment variables

| Variable                  | Default                                        | Details                                                                                                      |
| ------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `PUBLIC_API_URL`          | API calls fall back to `http://localhost:3000` | Set at frontend build time. Required when frontend and API use different origins because noVNC also uses it. |
| `DB_FILE_NAME`            | `file:storage/applier.db`                      | Runtime libSQL URL. Drizzle migrations still target `storage/applier.db`.                                    |
| `JOB_APPLIER_STORAGE_DIR` | `storage`                                      | Changes LinkedIn session and external-agent memory paths only; it doesn't relocate every runtime file.       |
| `TYPST_PATH`              | Typst from `PATH`                              | Path to the Typst binary used by `resume-ci`.                                                                |
| `GITHUB_CLIENT_ID`        | unset                                          | Required with `GITHUB_CLIENT_SECRET` for GitHub resume sync.                                                 |
| `GITHUB_CLIENT_SECRET`    | unset                                          | OAuth secret used for GitHub token exchange.                                                                 |

GitHub sync requests the `repo` scope and stores its token locally. Use a dedicated OAuth app and restrict access where your GitHub plan permits it.

## Data storage

By default, the backend writes persistent data under `apps/backend/storage`:

| Path                                                        | Contents                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| `applier.db`                                                | Jobs, applications, questions, executions, and settings     |
| `resumes/`                                                  | Uploaded PDF resumes                                        |
| `resume/masters/`                                           | Structured YAML master resumes                              |
| `resume/tailored/`                                          | Per-job resume sources and metadata                         |
| `resume/templates/`                                         | Typst templates                                             |
| `*-auth.json`, `linkedin-session.json`, `agent-memory.json` | Provider tokens, browser state, and remembered form answers |

These files may contain personal data and access tokens. Back them up only to encrypted storage. The included `.dockerignore` keeps the `storage` directory out of image builds, but you should still avoid copying a populated `storage` directory into any image you distribute.

The **Clear database** action removes jobs, applications, and their questions. It keeps settings, execution history, resumes, and credentials.

## Development

### Commands

```bash
# Run frontend and backend in watch mode
pnpm dev

# Bundle the backend for production
pnpm -C apps/backend build

# Type-check and lint the frontend
pnpm -C apps/frontend check
pnpm -C apps/frontend lint

# Type-check the backend without emitting files
pnpm -C apps/backend exec tsc --noEmit

# Create and apply Drizzle migrations
pnpm -C apps/backend db:generate
pnpm -C apps/backend db:migrate
```

There is no project test suite or CI workflow at present. The backend `build` command runs esbuild; use the explicit `tsc --noEmit` command above for TypeScript diagnostics.

### Production build

```bash
pnpm --filter backend build
PUBLIC_API_URL=http://localhost:3000 pnpm --filter frontend build
```

Run the built applications in separate processes:

```bash
pnpm -C apps/backend start
PORT=3001 HOST=0.0.0.0 pnpm -C apps/frontend exec node build/index.js
```

The backend expects `apps/backend` as its working directory because its default storage paths are relative. The included Docker entrypoint handles this layout and runs migrations before startup.

### API reference

Scalar serves an API reference at `http://localhost:3000/docs`, with the OpenAPI document at `http://localhost:3000/openapi`. Some routes use plain Hono handlers and therefore don't appear in the generated document yet.

## Operational limits

- EZJobApplier targets a single trusted user; it has no accounts, permissions, or tenant isolation.
- LinkedIn DOM changes, checkpoints, daily limits, or account restrictions can interrupt automation. A successful login may also switch the LinkedIn interface language to English.
- Manually added URLs must be LinkedIn job URLs with a numeric job ID. Generic ATS URLs aren't accepted by the manual importer.
- External-agent sessions and their chat state live in memory; restarting the backend ends active sessions.
- The Docker setup has no TLS, reverse proxy, health check, or application-level authentication.

Automation may conflict with a site's terms or trigger anti-bot controls. You are responsible for account safety, submitted content, and compliance with the services you automate.

## Troubleshooting

<details>
<summary><strong>Chromium or Cloak Browser doesn't start</strong></summary>

Install the binaries and Playwright's OS dependencies, then retry:

```bash
pnpm -C apps/backend exec playwright-core install chromium
pnpm -C apps/backend exec playwright-core install-deps chromium
pnpm -C apps/backend exec cloakbrowser install
```

Visible sessions also need Xvfb, x11vnc, and procps on Linux. Docker already includes them.

</details>

<details>
<summary><strong>LinkedIn requests a login</strong></summary>

Open the live browser when the execution reports **Login required**. Complete the login there; the backend saves the resulting browser state for later cycles.

</details>

<details>
<summary><strong>The frontend can't reach the API or noVNC</strong></summary>

Set `PUBLIC_API_URL=http://localhost:3000` in `apps/frontend/.env`, then restart or rebuild the frontend. Confirm that port `3000` is reachable from the browser.

</details>

<details>
<summary><strong>Resume PDF generation fails</strong></summary>

Install Typst and make sure it is on `PATH`, or set `TYPST_PATH` to the executable. The Docker image installs Typst during its build.

</details>

<details>
<summary><strong>Database migration can't create the SQLite file</strong></summary>

Create the storage directory before migrating:

```bash
mkdir -p apps/backend/storage
pnpm -C apps/backend db:migrate
```

</details>

## License

Released under the [MIT License](./LICENSE).

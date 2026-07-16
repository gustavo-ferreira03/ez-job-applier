<!-- prettier-ignore -->
<div align="center">

<img src="./apps/frontend/src/lib/assets/favicon.svg" alt="EZJobApplier icon" align="center" height="72" />

# EZJobApplier

_A local control room for job discovery, resume tailoring, and assisted applications._

[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Svelte](https://img.shields.io/badge/Svelte-5-ff3e00?style=flat-square&logo=svelte&logoColor=white)](https://svelte.dev/)
[![Hono](https://img.shields.io/badge/Hono-API-e36002?style=flat-square)](https://hono.dev/)
[![pnpm](https://img.shields.io/badge/pnpm-10.30.1-f69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ed?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)

[Features](#features) | [Architecture](#architecture) | [Getting Started](#getting-started) | [Configuration](#configuration) | [Usage](#usage) | [Troubleshooting](#troubleshooting)

</div>

EZJobApplier helps job seekers run repeatable LinkedIn searches, review discovered roles, tailor resumes, answer application questions, and supervise submissions from one dashboard. It keeps automation visible: jobs move through a pipeline, browser sessions can be watched through VNC, and the assistant asks before applying.

> [!WARNING]
> This app can operate a browser and submit real job applications after user approval. Review your search filters, resume data, generated answers, and submission confirmations before running it against live accounts.

## Features

- **Pipeline dashboard** with columns for found jobs, required input, review, submitted, failed, and rejected applications.
- **LinkedIn discovery and Easy Apply** using Playwright-powered browser sessions, saved login state, and visible VNC when action is required.
- **External ATS agent** for non-LinkedIn application URLs, with live browser view and chat handoff before final submit.
- **Resume management** with PDF upload, structured master resumes, per-job tailoring, Typst PDF output, and optional GitHub sync for `resume-ci` repositories.
- **Chat assistant** that can read pipeline status, ingest job URLs, tailor resumes, and start application flows through backend tools.
- **Automation controls** for static filters, AI filtering, auto-answering, schedule windows, execution intervals, and Telegram notifications.

## Architecture

| Area        | Stack                                                      | Notes                                                                                   |
| ----------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Frontend    | SvelteKit, Svelte 5 runes, Tailwind CSS 4                  | Dashboard, settings, chat, modal flows, and noVNC client.                               |
| Backend     | Hono, `@hono/zod-openapi`, WebSocket server                | REST API, OpenAPI docs, browser/VNC bridge, and worker orchestration.                   |
| Persistence | SQLite/libSQL, Drizzle ORM                                 | Jobs, applications, execution state, settings, and chat threads.                        |
| Automation  | Playwright Core, Playwright MCP, Cloak Browser, noVNC      | LinkedIn discovery, Easy Apply, and external ATS form filling.                          |
| AI          | `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent` | Provider auth, chat tools, resume extraction/tailoring, and external application agent. |

The repository is a pnpm workspace:

```text
.
|-- apps/
|   |-- backend/      # Hono API, Drizzle schema, workers, providers, AI tools
|   `-- frontend/     # SvelteKit app and UI components
|-- docs/             # Planning/spec notes
|-- docker-compose.yml
|-- Dockerfile
`-- pnpm-workspace.yaml
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer
- [pnpm](https://pnpm.io/) 10.30.1
- [Docker](https://www.docker.com/get-started/) if you prefer the containerized setup
- Chromium dependencies for local browser automation
- [Typst](https://typst.app/) for local resume PDF generation, unless you set `TYPST_PATH`

### Run With Docker

Docker is the easiest way to get the full browser stack, Typst, migrations, backend, and frontend running together.

```bash
PUBLIC_API_URL=http://localhost:3000 docker compose up --build
```

Open the app at `http://localhost:3001`. The API listens on `http://localhost:3000`, and backend storage persists in the `app-storage` Docker volume.

### Run Locally

Install dependencies from the workspace root:

```bash
pnpm install
```

Prepare the backend database:

```bash
pnpm -C apps/backend db:migrate
```

Install the browser assets used by automation:

```bash
pnpm -C apps/backend exec playwright-core install chromium
pnpm -C apps/backend exec cloakbrowser install
```

Create `apps/frontend/.env`:

```bash
PUBLIC_API_URL=http://localhost:3000
```

Start both apps:

```bash
pnpm dev
```

The backend starts on `http://localhost:3000`. The frontend uses Vite's dev server, usually `http://localhost:5173`.

> [!TIP]
> On Linux, Playwright may also need OS packages. If Chromium fails to launch, run `pnpm -C apps/backend exec playwright-core install-deps chromium` and retry.

## Configuration

Most settings live in the app under **Settings** and are stored in SQLite.

| Setting        | Where               | Purpose                                                                                                               |
| -------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Search profile | Settings > General  | Keywords, location, work model, level, job type, and LinkedIn search flags.                                           |
| Resumes        | Settings > General  | Upload PDFs, choose the default resume, and manage structured master resumes.                                         |
| AI provider    | Settings > AI       | Add API/OAuth credentials, choose provider/model, and enable filtering, auto-answering, tailoring, or external apply. |
| Schedule       | Settings > Advanced | Restrict execution to chosen days, hours, and timezone.                                                               |
| Telegram       | Settings > Advanced | Pair a bot for input/review prompts and external agent messages.                                                      |
| GitHub sync    | Settings > General  | Import master resumes and templates from a connected repository.                                                      |

Optional environment variables:

| Variable                                    | App      | Default                              | Notes                                                                        |
| ------------------------------------------- | -------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| `PUBLIC_API_URL`                            | Frontend | `http://localhost:3000` in API calls | Also used to build VNC WebSocket URLs. Set it for deployed or Docker builds. |
| `DB_FILE_NAME`                              | Backend  | `file:storage/applier.db`            | SQLite/libSQL database URL.                                                  |
| `JOB_APPLIER_STORAGE_DIR`                   | Backend  | `apps/backend/storage`               | Browser session and local storage directory.                                 |
| `TYPST_PATH`                                | Backend  | Typst from `PATH`                    | Override the Typst binary used by `resume-ci`.                               |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Backend  | unset                                | Required for GitHub OAuth resume sync.                                       |

## Usage

1. Open **Settings** and enter at least one search keyword.
2. Upload a resume PDF and set it as the default.
3. Configure an AI provider if you want filtering, auto-answering, resume tailoring, chat tools, or external ATS automation.
4. Click **Start execution** to discover jobs and process Easy Apply flows.
5. Review jobs in the pipeline. Approve, reject, retry, answer questions, tailor resumes, or open the live browser when the app asks for action.
6. Use **Assistant** to ask about your pipeline, paste job URLs, tailor a resume for a job ID, or start an application flow.

API documentation is available at `http://localhost:3000/docs`, backed by the OpenAPI document at `http://localhost:3000/openapi`.

## Development

Common commands:

```bash
# Start frontend and backend in parallel
pnpm dev

# Backend type/build checks
pnpm -C apps/backend build

# Frontend type checks and linting
pnpm -C apps/frontend check
pnpm -C apps/frontend lint

# Generate and apply database migrations
pnpm -C apps/backend db:generate
pnpm -C apps/backend db:migrate
```

Build both apps for production:

```bash
pnpm --filter backend build
PUBLIC_API_URL=http://localhost:3000 pnpm --filter frontend build
```

## Data Storage

The backend writes runtime data under `apps/backend/storage` by default:

- `applier.db` for SQLite data.
- `resumes/` for uploaded resume PDFs.
- `resume/masters/`, `resume/tailored/`, and `resume/templates/` for structured resume sources and generated variants.
- Browser/auth files for LinkedIn and AI provider sessions.

In Docker, that directory is mounted as the `app-storage` volume.

## Troubleshooting

> [!NOTE]
> If the assistant says the model is not configured or authenticated, open **Settings > AI**, add credentials, and select a provider/model before retrying.

**Chromium does not start locally**

Install browser binaries and system dependencies:

```bash
pnpm -C apps/backend exec playwright-core install chromium
pnpm -C apps/backend exec playwright-core install-deps chromium
```

**LinkedIn asks for login**

Use the live browser modal when prompted. The backend saves the session so later runs can reuse it.

**Resume PDF generation fails**

Install Typst locally or set `TYPST_PATH` to a valid binary. The Docker image already includes Typst.

**Frontend cannot reach the API**

Set `PUBLIC_API_URL=http://localhost:3000` in `apps/frontend/.env`, restart the frontend dev server, and confirm the backend is running.

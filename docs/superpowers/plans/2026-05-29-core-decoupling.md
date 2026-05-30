# Core Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Desacoplar completamente o `core/` de db, repositórios e providers concretos, usando `AppContext` com port interfaces e classes de repositório na camada `infra/`.

**Architecture:** O core define interfaces (`ports.ts`) e um objeto `AppContext`. As classes em `infra/` implementam essas interfaces usando Drizzle. As routes viram factories `createXRouter(ctx)`. O `index.ts` monta o `AppContext` e conecta tudo.

**Tech Stack:** TypeScript, Drizzle ORM (libsql), Hono/OpenAPI — nenhuma dependência nova.

---

## File Map

| Ação | Arquivo |
|---|---|
| CREATE | `src/core/ports.ts` |
| CREATE | `src/core/context.ts` |
| MODIFY | `src/db/client.ts` (export `Db` type) |
| CREATE | `src/infra/ProviderRegistry.ts` |
| CREATE | `src/infra/JobRepository.ts` |
| CREATE | `src/infra/ApplicationRepository.ts` |
| CREATE | `src/infra/DiscoveryRepository.ts` |
| CREATE | `src/infra/ResumeRepository.ts` |
| MODIFY | `src/core/applications/apply.ts` |
| MODIFY | `src/core/applications/get-questions.ts` |
| MODIFY | `src/core/applications/skip.ts` |
| MODIFY | `src/core/applications/answer.ts` |
| MODIFY | `src/core/discoveries/start.ts` |
| MODIFY | `src/core/discoveries/worker.ts` |
| MODIFY | `src/core/discoveries/get.ts` |
| MODIFY | `src/core/discoveries/cancel.ts` |
| MODIFY | `src/core/jobs/get.ts` |
| MODIFY | `src/core/jobs/list.ts` |
| MODIFY | `src/core/auto-apply/manager.ts` |
| MODIFY | `src/core/auto-apply/worker.ts` |
| MODIFY | `src/routes/applications.ts` |
| MODIFY | `src/routes/discoveries.ts` |
| MODIFY | `src/routes/jobs.ts` |
| MODIFY | `src/routes/auto-apply.ts` |
| MODIFY | `src/index.ts` |
| DELETE | `src/core/registry.ts` |
| DELETE | `src/repositories/jobs/` (directory) |
| DELETE | `src/repositories/applications/` (directory) |

---

## Task 1: Port interfaces e AppContext

**Files:**
- Create: `src/core/ports.ts`
- Create: `src/core/context.ts`
- Modify: `src/db/client.ts`

- [ ] **Step 1: Criar `src/core/ports.ts`**

```ts
import type { Job, DiscoverConfig, ApplicationQuestion, ApplicationStatus } from "./types";
import type { IJobProvider } from "./interfaces";
import type { DiscoveryJob } from "./discoveries/types";
import type { JobSummary, JobDetail } from "./jobs/types";

export interface IJobRepo {
    getById(id: number): Promise<Job | null>;
    getByProvider(provider: string, externalId: string): Promise<Job | null>;
    listIds(provider?: string): Promise<Set<string>>;
    save(job: Job): Promise<void>;
    getDetail(id: number): Promise<JobDetail | null>;
    listSummaries(): Promise<JobSummary[]>;
}

export interface ApplicationRecord {
    id: number;
    status: ApplicationStatus;
    resumeFilename: string | null;
    errorMessage: string | null;
}

export interface IAppRepo {
    get(provider: string, externalId: string): Promise<ApplicationRecord | null>;
    upsert(
        provider: string,
        externalId: string,
        status: ApplicationStatus,
        resumeFilename?: string,
        errorMessage?: string,
    ): Promise<ApplicationRecord>;
    updateStatus(id: number, status: ApplicationStatus, errorMessage?: string): Promise<void>;
    replaceQuestions(appId: number, questions: ApplicationQuestion[]): Promise<void>;
    getQuestions(appId: number): Promise<ApplicationQuestion[]>;
    answerQuestions(appId: number, answers: Record<string, string>): Promise<void>;
    listIdsByStatus(status: ApplicationStatus | string): Promise<number[]>;
    listFoundJobIds(): Promise<number[]>;
}

export interface IDiscoveryRepo {
    isRunning(): Promise<boolean>;
    create(id: string, config: DiscoverConfig): Promise<void>;
    incrementDiscovered(id: string): Promise<void>;
    finish(id: string, status: DiscoveryJob["status"], errorMessage?: string): Promise<void>;
    get(id: string): Promise<DiscoveryJob | null>;
    list(): Promise<DiscoveryJob[]>;
}

export interface IResumeRepo {
    /** Retorna o path absoluto do resume padrão, ou undefined se nenhum configurado */
    getDefaultResumePath(): Promise<string | undefined>;
}

export interface IProviderRegistry {
    register(provider: IJobProvider): void;
    get(name: string): IJobProvider;
    getForJob(job: Job): IJobProvider;
}
```

- [ ] **Step 2: Criar `src/core/context.ts`**

```ts
import type { IJobRepo, IAppRepo, IDiscoveryRepo, IResumeRepo, IProviderRegistry } from "./ports";

export interface AppContext {
    jobRepo: IJobRepo;
    appRepo: IAppRepo;
    discoveryRepo: IDiscoveryRepo;
    resumeRepo: IResumeRepo;
    providerRegistry: IProviderRegistry;
}
```

- [ ] **Step 3: Exportar tipo `Db` de `src/db/client.ts`**

Adicionar ao final de `src/db/client.ts`:

```ts
export type Db = typeof db;
```

- [ ] **Step 4: Verificar compilação**

```bash
cd /home/thelio/ez-job-applier/apps/backend && npx tsc --noEmit 2>&1 | head -30
```

Esperado: apenas erros existentes (nenhum novo introduzido por ports.ts/context.ts).

- [ ] **Step 5: Commit**

```bash
cd /home/thelio/ez-job-applier/apps/backend && git add src/core/ports.ts src/core/context.ts src/db/client.ts
git commit -m "feat: add core port interfaces and AppContext"
```

---

## Task 2: ProviderRegistry

**Files:**
- Create: `src/infra/ProviderRegistry.ts`

- [ ] **Step 1: Criar `src/infra/ProviderRegistry.ts`**

```ts
import type { IJobProvider } from "../core/interfaces";
import type { IProviderRegistry } from "../core/ports";
import type { Job } from "../core/types";

export class ProviderRegistry implements IProviderRegistry {
    private providers = new Map<string, IJobProvider>();

    register(provider: IJobProvider): void {
        this.providers.set(provider.name, provider);
    }

    get(name: string): IJobProvider {
        const provider = this.providers.get(name);
        if (!provider) throw new Error(`Provider "${name}" not registered`);
        return provider;
    }

    getForJob(job: Job): IJobProvider {
        for (const provider of this.providers.values()) {
            if (provider.matchesJob(job)) return provider;
        }
        throw new Error(`No provider found for job "${job.jobId}" (${job.url})`);
    }
}
```

- [ ] **Step 2: Verificar compilação**

```bash
cd /home/thelio/ez-job-applier/apps/backend && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
cd /home/thelio/ez-job-applier/apps/backend && git add src/infra/ProviderRegistry.ts
git commit -m "feat: add ProviderRegistry infra class"
```

---

## Task 3: JobRepository

**Files:**
- Create: `src/infra/JobRepository.ts`

- [ ] **Step 1: Criar `src/infra/JobRepository.ts`**

```ts
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobs, applications, applicationQuestions } from "../db/schema";
import type { IJobRepo } from "../core/ports";
import type { Job } from "../core/types";
import type { ApplicationStatus } from "../core/types";
import type { JobDetail, JobSummary } from "../core/jobs/types";
import type { ApplicationQuestion } from "../core/types";

function parseList(value: string | null): string[] {
    if (!value) return [];
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed)
            ? parsed.filter((item): item is string => typeof item === "string")
            : [];
    } catch {
        return [];
    }
}

function parseOptions(value: string | null): string[] {
    return parseList(value);
}

function serializeList(values: string[]): string {
    return JSON.stringify(values);
}

function jobFromRow(row: typeof jobs.$inferSelect): Job {
    return {
        jobId: row.externalId,
        provider: row.provider,
        title: row.title,
        company: row.company,
        location: row.location,
        url: row.url,
        preferences: parseList(row.preferences),
        skills: parseList(row.skills),
        about: row.about,
        applicationUrl: row.applicationUrl,
    };
}

function questionFromRow(row: typeof applicationQuestions.$inferSelect): ApplicationQuestion {
    return {
        label: row.label,
        answer: row.answer ?? undefined,
        fieldType: (row.fieldType ?? undefined) as ApplicationQuestion["fieldType"],
        options: parseOptions(row.options),
    };
}

export class JobRepository implements IJobRepo {
    constructor(private db: Db) {}

    async getById(id: number): Promise<Job | null> {
        const [row] = await this.db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
        return row ? jobFromRow(row) : null;
    }

    async getByProvider(provider: string, externalId: string): Promise<Job | null> {
        const [row] = await this.db
            .select()
            .from(jobs)
            .where(and(eq(jobs.provider, provider), eq(jobs.externalId, externalId)))
            .limit(1);
        return row ? jobFromRow(row) : null;
    }

    async listIds(provider?: string): Promise<Set<string>> {
        const rows = provider
            ? await this.db
                  .select({ externalId: jobs.externalId })
                  .from(jobs)
                  .where(eq(jobs.provider, provider))
            : await this.db.select({ externalId: jobs.externalId }).from(jobs);
        return new Set(rows.map((r) => r.externalId));
    }

    async save(job: Job): Promise<void> {
        const timestamp = new Date().toISOString();
        await this.db
            .insert(jobs)
            .values({
                provider: job.provider,
                externalId: job.jobId,
                title: job.title,
                company: job.company,
                location: job.location,
                url: job.url,
                preferences: serializeList(job.preferences),
                skills: serializeList(job.skills),
                about: job.about,
                applicationUrl: job.applicationUrl,
                createdAt: timestamp,
                updatedAt: timestamp,
            })
            .onConflictDoUpdate({
                target: [jobs.provider, jobs.externalId],
                set: {
                    title: job.title,
                    company: job.company,
                    location: job.location,
                    url: job.url,
                    preferences: serializeList(job.preferences),
                    skills: serializeList(job.skills),
                    about: job.about,
                    applicationUrl: job.applicationUrl,
                    updatedAt: timestamp,
                },
            });
    }

    async getDetail(id: number): Promise<JobDetail | null> {
        const [row] = await this.db
            .select({ job: jobs, application: applications })
            .from(jobs)
            .leftJoin(applications, eq(applications.jobId, jobs.id))
            .where(eq(jobs.id, id))
            .limit(1);

        if (!row) return null;

        const { job, application } = row;
        const questionRows = application
            ? await this.db
                  .select()
                  .from(applicationQuestions)
                  .where(eq(applicationQuestions.applicationId, application.id))
            : [];

        return {
            id: job.id,
            externalId: job.externalId,
            provider: job.provider,
            title: job.title,
            company: job.company,
            location: job.location,
            url: job.url,
            preferences: parseList(job.preferences),
            skills: parseList(job.skills),
            about: job.about,
            applicationUrl: job.applicationUrl,
            status: (application?.status ?? "FOUND") as ApplicationStatus,
            resumeFilename: application?.resumeFilename ?? null,
            errorMessage: application?.errorMessage ?? null,
            unansweredCount: questionRows.filter((q) => q.answer === null).length,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            questions: questionRows.map(questionFromRow),
        };
    }

    async listSummaries(): Promise<JobSummary[]> {
        const rows = await this.db
            .select({ job: jobs, application: applications })
            .from(jobs)
            .leftJoin(applications, eq(applications.jobId, jobs.id))
            .orderBy(desc(jobs.updatedAt));

        const appIds = rows
            .filter((r) => r.application !== null)
            .map((r) => r.application!.id);

        const unansweredMap = new Map<number, number>();
        if (appIds.length > 0) {
            const qRows = await this.db
                .select({
                    applicationId: applicationQuestions.applicationId,
                    answer: applicationQuestions.answer,
                })
                .from(applicationQuestions)
                .where(inArray(applicationQuestions.applicationId, appIds));

            for (const q of qRows) {
                if (q.answer === null) {
                    unansweredMap.set(q.applicationId, (unansweredMap.get(q.applicationId) ?? 0) + 1);
                }
            }
        }

        return rows.map(({ job, application }) => ({
            id: job.id,
            externalId: job.externalId,
            provider: job.provider,
            title: job.title,
            company: job.company,
            location: job.location,
            url: job.url,
            preferences: parseList(job.preferences),
            skills: parseList(job.skills),
            about: job.about,
            applicationUrl: job.applicationUrl,
            status: (application?.status ?? "FOUND") as ApplicationStatus,
            resumeFilename: application?.resumeFilename ?? null,
            errorMessage: application?.errorMessage ?? null,
            unansweredCount: application ? (unansweredMap.get(application.id) ?? 0) : 0,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
        }));
    }
}
```

- [ ] **Step 2: Verificar compilação**

```bash
cd /home/thelio/ez-job-applier/apps/backend && npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 3: Commit**

```bash
cd /home/thelio/ez-job-applier/apps/backend && git add src/infra/JobRepository.ts
git commit -m "feat: add JobRepository infra class"
```

---

## Task 4: ApplicationRepository

**Files:**
- Create: `src/infra/ApplicationRepository.ts`

- [ ] **Step 1: Criar `src/infra/ApplicationRepository.ts`**

```ts
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { jobs, applications, applicationQuestions } from "../db/schema";
import type { IAppRepo, ApplicationRecord } from "../core/ports";
import type { ApplicationQuestion, ApplicationStatus } from "../core/types";

function serializeOptions(options: string[] | undefined): string {
    return JSON.stringify(options ?? []);
}

function parseOptions(value: string | null): string[] {
    if (!value) return [];
    try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed)
            ? parsed.filter((o): o is string => typeof o === "string")
            : [];
    } catch {
        return [];
    }
}

function toRecord(row: typeof applications.$inferSelect): ApplicationRecord {
    return {
        id: row.id,
        status: row.status as ApplicationStatus,
        resumeFilename: row.resumeFilename ?? null,
        errorMessage: row.errorMessage ?? null,
    };
}

export class ApplicationRepository implements IAppRepo {
    constructor(private db: Db) {}

    async get(provider: string, externalId: string): Promise<ApplicationRecord | null> {
        const [jobRow] = await this.db
            .select()
            .from(jobs)
            .where(and(eq(jobs.provider, provider), eq(jobs.externalId, externalId)))
            .limit(1);

        if (!jobRow) return null;

        const [row] = await this.db
            .select()
            .from(applications)
            .where(eq(applications.jobId, jobRow.id))
            .limit(1);

        return row ? toRecord(row) : null;
    }

    async upsert(
        provider: string,
        externalId: string,
        status: ApplicationStatus,
        resumeFilename?: string,
        errorMessage?: string,
    ): Promise<ApplicationRecord> {
        const [jobRow] = await this.db
            .select()
            .from(jobs)
            .where(and(eq(jobs.provider, provider), eq(jobs.externalId, externalId)))
            .limit(1);

        if (!jobRow) throw new Error(`Job not found: ${provider}/${externalId}`);

        const timestamp = new Date().toISOString();

        await this.db
            .insert(applications)
            .values({
                jobId: jobRow.id,
                status,
                resumeFilename: resumeFilename ?? null,
                errorMessage: errorMessage ?? null,
                createdAt: timestamp,
                updatedAt: timestamp,
            })
            .onConflictDoUpdate({
                target: applications.jobId,
                set: {
                    status,
                    resumeFilename: resumeFilename ?? null,
                    errorMessage: errorMessage ?? null,
                    updatedAt: timestamp,
                },
            });

        return (await this.get(provider, externalId))!;
    }

    async updateStatus(id: number, status: ApplicationStatus, errorMessage?: string): Promise<void> {
        await this.db
            .update(applications)
            .set({ status, errorMessage: errorMessage ?? null, updatedAt: new Date().toISOString() })
            .where(eq(applications.id, id));
    }

    async replaceQuestions(appId: number, questions: ApplicationQuestion[]): Promise<void> {
        await this.db
            .delete(applicationQuestions)
            .where(eq(applicationQuestions.applicationId, appId));

        if (questions.length === 0) return;

        await this.db.insert(applicationQuestions).values(
            questions.map((q) => ({
                applicationId: appId,
                label: q.label,
                answer: q.answer ?? null,
                fieldType: q.fieldType ?? null,
                options: serializeOptions(q.options),
            })),
        );
    }

    async getQuestions(appId: number): Promise<ApplicationQuestion[]> {
        const rows = await this.db
            .select()
            .from(applicationQuestions)
            .where(eq(applicationQuestions.applicationId, appId));

        return rows.map((row) => ({
            label: row.label,
            answer: row.answer ?? undefined,
            fieldType: (row.fieldType ?? undefined) as ApplicationQuestion["fieldType"],
            options: parseOptions(row.options),
        }));
    }

    async answerQuestions(appId: number, answers: Record<string, string>): Promise<void> {
        for (const [label, answer] of Object.entries(answers)) {
            await this.db
                .update(applicationQuestions)
                .set({ answer })
                .where(
                    and(
                        eq(applicationQuestions.applicationId, appId),
                        eq(applicationQuestions.label, label),
                    ),
                );
        }
    }

    async listIdsByStatus(status: ApplicationStatus | string): Promise<number[]> {
        const rows = await this.db
            .select({ jobId: applications.jobId })
            .from(applications)
            .where(eq(applications.status, status));
        return rows.map((r) => r.jobId);
    }

    async listFoundJobIds(): Promise<number[]> {
        const rows = await this.db
            .select({ id: jobs.id })
            .from(jobs)
            .leftJoin(applications, eq(applications.jobId, jobs.id))
            .where(isNull(applications.id));
        return rows.map((r) => r.id);
    }
}
```

- [ ] **Step 2: Verificar compilação**

```bash
cd /home/thelio/ez-job-applier/apps/backend && npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 3: Commit**

```bash
cd /home/thelio/ez-job-applier/apps/backend && git add src/infra/ApplicationRepository.ts
git commit -m "feat: add ApplicationRepository infra class"
```

---

## Task 5: DiscoveryRepository

**Files:**
- Create: `src/infra/DiscoveryRepository.ts`

- [ ] **Step 1: Criar `src/infra/DiscoveryRepository.ts`**

```ts
import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { discoveries } from "../db/schema";
import type { IDiscoveryRepo } from "../core/ports";
import type { DiscoverConfig } from "../core/types";
import type { DiscoveryJob } from "../core/discoveries/types";

function toDiscoveryJob(row: typeof discoveries.$inferSelect): DiscoveryJob {
    return {
        id: row.id,
        provider: row.provider,
        config: JSON.parse(row.config) as DiscoverConfig,
        status: row.status as DiscoveryJob["status"],
        discovered: row.discovered,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt ?? null,
        errorMessage: row.errorMessage ?? null,
    };
}

export class DiscoveryRepository implements IDiscoveryRepo {
    constructor(private db: Db) {}

    async isRunning(): Promise<boolean> {
        const rows = await this.db
            .select()
            .from(discoveries)
            .where(eq(discoveries.status, "running"))
            .limit(1);
        return rows.length > 0;
    }

    async create(id: string, config: DiscoverConfig): Promise<void> {
        await this.db.insert(discoveries).values({
            id,
            provider: config.provider,
            config: JSON.stringify(config),
            status: "running",
            discovered: 0,
            startedAt: new Date().toISOString(),
        });
    }

    async incrementDiscovered(id: string): Promise<void> {
        await this.db
            .update(discoveries)
            .set({ discovered: sql`${discoveries.discovered} + 1` })
            .where(eq(discoveries.id, id));
    }

    async finish(id: string, status: DiscoveryJob["status"], errorMessage?: string): Promise<void> {
        await this.db
            .update(discoveries)
            .set({
                status,
                finishedAt: new Date().toISOString(),
                errorMessage: errorMessage ?? null,
            })
            .where(eq(discoveries.id, id));
    }

    async get(id: string): Promise<DiscoveryJob | null> {
        const [row] = await this.db
            .select()
            .from(discoveries)
            .where(eq(discoveries.id, id))
            .limit(1);
        return row ? toDiscoveryJob(row) : null;
    }

    async list(): Promise<DiscoveryJob[]> {
        const rows = await this.db
            .select()
            .from(discoveries)
            .orderBy(desc(discoveries.startedAt));
        return rows.map(toDiscoveryJob);
    }
}
```

- [ ] **Step 2: Verificar compilação**

```bash
cd /home/thelio/ez-job-applier/apps/backend && npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 3: Commit**

```bash
cd /home/thelio/ez-job-applier/apps/backend && git add src/infra/DiscoveryRepository.ts
git commit -m "feat: add DiscoveryRepository infra class"
```

---

## Task 6: ResumeRepository

**Files:**
- Create: `src/infra/ResumeRepository.ts`

- [ ] **Step 1: Criar `src/infra/ResumeRepository.ts`**

```ts
import path from "node:path";
import fs from "node:fs/promises";
import type { IResumeRepo } from "../core/ports";

const SETTINGS_FILE = path.resolve("storage/settings.json");
export const RESUMES_DIR = path.resolve("storage/resumes");

export class ResumeRepository implements IResumeRepo {
    async getDefaultResumePath(): Promise<string | undefined> {
        try {
            const raw = await fs.readFile(SETTINGS_FILE, "utf-8");
            const settings = JSON.parse(raw) as { default_resume?: string | null };
            const filename = settings.default_resume;
            return filename ? path.join(RESUMES_DIR, filename) : undefined;
        } catch {
            return undefined;
        }
    }
}
```

- [ ] **Step 2: Verificar compilação**

```bash
cd /home/thelio/ez-job-applier/apps/backend && npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 3: Commit**

```bash
cd /home/thelio/ez-job-applier/apps/backend && git add src/infra/ResumeRepository.ts
git commit -m "feat: add ResumeRepository infra class"
```

---

## Task 7: Refatorar core/applications/

**Files:**
- Modify: `src/core/applications/apply.ts`
- Modify: `src/core/applications/get-questions.ts`
- Modify: `src/core/applications/skip.ts`
- Modify: `src/core/applications/answer.ts`

- [ ] **Step 1: Substituir `src/core/applications/apply.ts`**

```ts
import type { AppContext } from "../context";
import type { ApplyResult } from "../types";

export async function applyToJob(
    jobId: number,
    answers: Record<string, string> = {},
    ctx: AppContext,
    resumeFilename?: string,
): Promise<ApplyResult> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const existing = await ctx.appRepo.get(job.provider, job.jobId);
    if (existing) {
        const persisted = await ctx.appRepo.getQuestions(existing.id);
        for (const q of persisted) {
            if (q.answer && !answers[q.label]) {
                answers[q.label] = q.answer;
            }
        }
    }

    const resumePath = resumeFilename
        ? undefined // caller provided specific filename — resolve outside if needed
        : await ctx.resumeRepo.getDefaultResumePath();

    const provider = ctx.providerRegistry.getForJob(job);
    const session = await provider.createSession();

    try {
        const result = await session.apply(job, answers, resumePath);

        const application = await ctx.appRepo.upsert(
            job.provider,
            job.jobId,
            result.status,
            undefined,
            result.errorMessage,
        );
        await ctx.appRepo.replaceQuestions(application.id, result.questions);

        return result;
    } finally {
        await session.close();
    }
}
```

**Nota:** A rota `/jobs/{id}/apply` antes passava `resumeFilename` para obter o path. Com o desacoplamento, o core não monta paths de arquivo. O parâmetro `resumeFilename` da rota deve ser resolvido antes de chamar o core, ou removido da assinatura. Para simplificar e manter compatibilidade, o `resumeFilename` da rota continua sendo aceito mas o path é resolvido na própria rota. O `applyToJob` no core usa apenas `ctx.resumeRepo.getDefaultResumePath()`. Veja Task 11 para a rota.

- [ ] **Step 2: Substituir `src/core/applications/get-questions.ts`**

```ts
import type { AppContext } from "../context";
import type { ApplyResult } from "../types";

export async function getQuestions(jobId: number, ctx: AppContext): Promise<ApplyResult> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const provider = ctx.providerRegistry.getForJob(job);
    const session = await provider.createSession();

    try {
        const resumePath = await ctx.resumeRepo.getDefaultResumePath();
        const result = await session.getQuestions(job, resumePath);

        const application = await ctx.appRepo.upsert(
            job.provider,
            job.jobId,
            result.status,
            undefined,
            result.errorMessage,
        );
        await ctx.appRepo.replaceQuestions(application.id, result.questions);

        return result;
    } finally {
        await session.close();
    }
}
```

- [ ] **Step 3: Substituir `src/core/applications/skip.ts`**

```ts
import type { AppContext } from "../context";

export async function skipJob(jobId: number, ctx: AppContext): Promise<void> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    await ctx.appRepo.upsert(job.provider, job.jobId, "SKIPPED");
}
```

- [ ] **Step 4: Substituir `src/core/applications/answer.ts`**

```ts
import type { AppContext } from "../context";

export async function saveAnswers(
    jobId: number,
    answers: Record<string, string>,
    ctx: AppContext,
): Promise<void> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const application = await ctx.appRepo.get(job.provider, job.jobId);
    if (!application)
        throw new Error(
            `No application found for job ${jobId}. Call POST /jobs/${jobId}/questions first.`,
        );

    await ctx.appRepo.answerQuestions(application.id, answers);

    const questions = await ctx.appRepo.getQuestions(application.id);
    const allAnswered = questions.length > 0 && questions.every((q) => q.answer != null);
    if (allAnswered) {
        await ctx.appRepo.updateStatus(application.id, "READY_FOR_REVIEW");
    }
}
```

- [ ] **Step 5: Verificar compilação**

```bash
cd /home/thelio/ez-job-applier/apps/backend && npx tsc --noEmit 2>&1 | head -40
```

Esperado: erros nos arquivos que ainda importam as funções antigas (routes e worker). Nenhum erro dentro de `core/applications/`.

- [ ] **Step 6: Commit**

```bash
cd /home/thelio/ez-job-applier/apps/backend && git add src/core/applications/
git commit -m "refactor: decouple core/applications from infra — inject AppContext"
```

---

## Task 8: Refatorar core/discoveries/

**Files:**
- Modify: `src/core/discoveries/start.ts`
- Modify: `src/core/discoveries/worker.ts`
- Modify: `src/core/discoveries/get.ts`
- Modify: `src/core/discoveries/cancel.ts`

- [ ] **Step 1: Substituir `src/core/discoveries/start.ts`**

```ts
import { startWorker } from "./worker";
import type { AppContext } from "../context";
import type { DiscoverConfig } from "../types";
import type { DiscoveryJob } from "./types";

export async function startDiscovery(
    config: DiscoverConfig,
    ctx: AppContext,
): Promise<DiscoveryJob> {
    const running = await ctx.discoveryRepo.isRunning();
    if (running) throw new Error("A discovery is already running");

    const id = crypto.randomUUID();
    await ctx.discoveryRepo.create(id, config);

    startWorker(id, config, ctx);

    return {
        id,
        provider: config.provider,
        config,
        status: "running",
        discovered: 0,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        errorMessage: null,
    };
}
```

- [ ] **Step 2: Substituir `src/core/discoveries/worker.ts`**

```ts
import { getProvider } from "../registry";
import type { AppContext } from "../context";
import type { DiscoverConfig } from "../types";

const activeAborts = new Map<string, AbortController>();

export function startWorker(id: string, config: DiscoverConfig, ctx: AppContext): void {
    const abort = new AbortController();
    activeAborts.set(id, abort);
    run(id, config, ctx, abort.signal).finally(() => activeAborts.delete(id));
}

export function cancelWorker(id: string): boolean {
    const abort = activeAborts.get(id);
    if (!abort) return false;
    abort.abort();
    return true;
}

async function run(
    id: string,
    config: DiscoverConfig,
    ctx: AppContext,
    signal: AbortSignal,
): Promise<void> {
    try {
        const provider = ctx.providerRegistry.get(config.provider);
        const skipIds = await ctx.jobRepo.listIds(config.provider);
        const session = await provider.createSession();

        try {
            for await (const job of session.discoverJobs(config, skipIds)) {
                if (signal.aborted) break;
                await ctx.jobRepo.save(job);
                await ctx.discoveryRepo.incrementDiscovered(id);
            }
        } finally {
            await session.close();
        }

        const status = signal.aborted ? "cancelled" : "done";
        await ctx.discoveryRepo.finish(id, status);
    } catch (err) {
        await ctx.discoveryRepo.finish(
            id,
            "failed",
            err instanceof Error ? err.message : String(err),
        );
    }
}
```

- [ ] **Step 3: Substituir `src/core/discoveries/get.ts`**

```ts
import type { AppContext } from "../context";
import type { DiscoveryJob } from "./types";

export async function getDiscovery(id: string, ctx: AppContext): Promise<DiscoveryJob | null> {
    return ctx.discoveryRepo.get(id);
}

export async function listDiscoveries(ctx: AppContext): Promise<DiscoveryJob[]> {
    return ctx.discoveryRepo.list();
}
```

- [ ] **Step 4: Substituir `src/core/discoveries/cancel.ts`**

```ts
import { cancelWorker } from "./worker";
import type { AppContext } from "../context";

export async function cancelDiscovery(id: string, ctx: AppContext): Promise<boolean> {
    const record = await ctx.discoveryRepo.get(id);
    if (!record || record.status !== "running") return false;
    cancelWorker(id);
    return true;
}
```

- [ ] **Step 5: Verificar compilação**

```bash
cd /home/thelio/ez-job-applier/apps/backend && npx tsc --noEmit 2>&1 | head -40
```

**Atenção:** `worker.ts` ainda importa `getProvider` de `"../registry"`. Isso deve ser removido — o `ctx.providerRegistry.get()` é o substituto. Verificar se o step 2 já não usa `getProvider` diretamente (o código acima usa `ctx.providerRegistry.get()`). Se houver import residual, remover.

- [ ] **Step 6: Commit**

```bash
cd /home/thelio/ez-job-applier/apps/backend && git add src/core/discoveries/
git commit -m "refactor: decouple core/discoveries from infra — inject AppContext"
```

---

## Task 9: Refatorar core/jobs/

**Files:**
- Modify: `src/core/jobs/get.ts`
- Modify: `src/core/jobs/list.ts`

- [ ] **Step 1: Substituir `src/core/jobs/get.ts`**

```ts
import type { AppContext } from "../context";
import type { JobDetail } from "./types";

export async function getJob(id: number, ctx: AppContext): Promise<JobDetail | null> {
    return ctx.jobRepo.getDetail(id);
}
```

- [ ] **Step 2: Substituir `src/core/jobs/list.ts`**

```ts
import type { AppContext } from "../context";
import type { JobSummary } from "./types";

export async function listJobs(ctx: AppContext): Promise<JobSummary[]> {
    return ctx.jobRepo.listSummaries();
}
```

- [ ] **Step 3: Verificar compilação**

```bash
cd /home/thelio/ez-job-applier/apps/backend && npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```bash
cd /home/thelio/ez-job-applier/apps/backend && git add src/core/jobs/get.ts src/core/jobs/list.ts
git commit -m "refactor: decouple core/jobs from infra — inject AppContext"
```

---

## Task 10: Refatorar core/auto-apply/

**Files:**
- Modify: `src/core/auto-apply/manager.ts`
- Modify: `src/core/auto-apply/worker.ts`

- [ ] **Step 1: Substituir `src/core/auto-apply/manager.ts`**

O `start()` passa a aceitar um `AppContext`. O ctx fica guardado em módulo para o worker lazy usar.

```ts
import type { AppContext } from "../context";

export interface AutoApplyStatus {
    running: boolean;
    applied: number;
    failed: number;
}

let state: AutoApplyStatus = { running: false, applied: 0, failed: 0 };
let stopFlag = false;
let _ctx: AppContext | null = null;

export function getStatus(): AutoApplyStatus {
    return { ...state };
}

export function isStopRequested(): boolean {
    return stopFlag;
}

export function getCtx(): AppContext {
    if (!_ctx) throw new Error("Auto-apply not started: no AppContext");
    return _ctx;
}

export function setRunning(value: boolean): void {
    state.running = value;
}

export function incrementApplied(): void {
    state.applied++;
}

export function incrementFailed(): void {
    state.failed++;
}

export function start(ctx: AppContext): void {
    if (state.running) return;
    _ctx = ctx;
    state = { running: true, applied: 0, failed: 0 };
    stopFlag = false;
    import("./worker").then(({ runLoop }) => runLoop().catch(console.error));
}

export function stop(): void {
    stopFlag = true;
}
```

- [ ] **Step 2: Substituir `src/core/auto-apply/worker.ts`**

```ts
import { getQuestions } from "../applications/get-questions";
import { applyToJob } from "../applications/apply";
import { isStopRequested, setRunning, incrementApplied, incrementFailed, getCtx } from "./manager";

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runLoop(): Promise<void> {
    try {
        while (!isStopRequested()) {
            const ctx = getCtx();

            // Phase 1: collect questions for FOUND jobs (no application yet)
            const foundIds = await ctx.appRepo.listFoundJobIds();
            for (const jobId of foundIds) {
                if (isStopRequested()) break;
                try {
                    await getQuestions(jobId, ctx);
                } catch (e) {
                    console.error(`Auto-apply: getQuestions failed for job ${jobId}:`, e);
                }
                await sleep(3000);
            }

            if (isStopRequested()) break;

            // Phase 2: submit READY_FOR_REVIEW jobs
            const readyIds = await ctx.appRepo.listIdsByStatus("READY_FOR_REVIEW");
            for (const jobId of readyIds) {
                if (isStopRequested()) break;
                try {
                    await applyToJob(jobId, {}, ctx);
                    incrementApplied();
                } catch (e) {
                    console.error(`Auto-apply: apply failed for job ${jobId}:`, e);
                    incrementFailed();
                }
                await sleep(3000);
            }

            if (foundIds.length === 0 && readyIds.length === 0) {
                await sleep(5000);
            }
        }
    } finally {
        setRunning(false);
    }
}
```

- [ ] **Step 3: Verificar compilação**

```bash
cd /home/thelio/ez-job-applier/apps/backend && npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```bash
cd /home/thelio/ez-job-applier/apps/backend && git add src/core/auto-apply/
git commit -m "refactor: decouple core/auto-apply from infra — inject AppContext"
```

---

## Task 11: Converter routes para factories

**Files:**
- Modify: `src/routes/applications.ts`
- Modify: `src/routes/discoveries.ts`
- Modify: `src/routes/jobs.ts`
- Modify: `src/routes/auto-apply.ts`

- [ ] **Step 1: Substituir `src/routes/applications.ts`**

```ts
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getQuestions } from "../core/applications/get-questions";
import { saveAnswers } from "../core/applications/answer";
import { applyToJob } from "../core/applications/apply";
import { skipJob } from "../core/applications/skip";
import type { AppContext } from "../core/context";

const JobIdParam = z.object({
    id: z.coerce.number().int().openapi({
        param: { name: "id", in: "path" },
        example: 1,
    }),
});

const AnswersBody = z
    .object({
        answers: z.record(z.string(), z.string()).openapi({
            example: { "Years of experience": "3", "Work authorization": "Yes" },
        }),
    })
    .openapi("AnswersBody");

const ApplyBody = z
    .object({
        answers: z.record(z.string(), z.string()).optional().openapi({
            example: { "Years of experience": "3" },
        }),
    })
    .openapi("ApplyBody");

export function createApplicationsRouter(ctx: AppContext): OpenAPIHono {
    const router = new OpenAPIHono();

    router.openapi(
        createRoute({
            method: "post",
            path: "/jobs/{id}/questions",
            tags: ["Applications"],
            summary: "Open the application form and extract questions",
            request: { params: JobIdParam },
            responses: {
                200: { description: "Questions extracted" },
                404: { description: "Job not found" },
            },
        }),
        async (c) => {
            const { id } = c.req.valid("param");
            try {
                const result = await getQuestions(id, ctx);
                return c.json(result);
            } catch (err) {
                if (err instanceof Error && err.message.includes("not found")) {
                    throw new HTTPException(404, { message: err.message });
                }
                throw err;
            }
        },
    );

    router.openapi(
        createRoute({
            method: "post",
            path: "/jobs/{id}/answers",
            tags: ["Applications"],
            summary: "Save answers without re-opening the form",
            request: {
                params: JobIdParam,
                body: { content: { "application/json": { schema: AnswersBody } }, required: true },
            },
            responses: {
                200: { description: "Answers saved" },
                404: { description: "Job or application not found" },
            },
        }),
        async (c) => {
            const { id } = c.req.valid("param");
            const { answers } = c.req.valid("json");
            try {
                await saveAnswers(id, answers, ctx);
                return c.json({ ok: true });
            } catch (err) {
                if (err instanceof Error && err.message.includes("not found")) {
                    throw new HTTPException(404, { message: err.message });
                }
                throw err;
            }
        },
    );

    router.openapi(
        createRoute({
            method: "post",
            path: "/jobs/{id}/apply",
            tags: ["Applications"],
            summary: "Submit the application with saved answers",
            request: {
                params: JobIdParam,
                body: { content: { "application/json": { schema: ApplyBody } } },
            },
            responses: {
                200: { description: "Application result" },
                404: { description: "Job not found" },
            },
        }),
        async (c) => {
            const { id } = c.req.valid("param");
            const body = c.req.valid("json");
            try {
                const result = await applyToJob(id, body?.answers ?? {}, ctx);
                return c.json(result);
            } catch (err) {
                if (err instanceof Error && err.message.includes("not found")) {
                    throw new HTTPException(404, { message: err.message });
                }
                throw err;
            }
        },
    );

    router.openapi(
        createRoute({
            method: "post",
            path: "/jobs/{id}/skip",
            tags: ["Applications"],
            summary: "Mark a job as skipped",
            request: { params: JobIdParam },
            responses: {
                200: { description: "Job skipped" },
                404: { description: "Job not found" },
            },
        }),
        async (c) => {
            const { id } = c.req.valid("param");
            try {
                await skipJob(id, ctx);
                return c.json({ ok: true });
            } catch (err) {
                if (err instanceof Error && err.message.includes("not found")) {
                    throw new HTTPException(404, { message: err.message });
                }
                throw err;
            }
        },
    );

    return router;
}
```

- [ ] **Step 2: Substituir `src/routes/discoveries.ts`**

```ts
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { startDiscovery } from "../core/discoveries/start";
import { getDiscovery, listDiscoveries } from "../core/discoveries/get";
import { cancelDiscovery } from "../core/discoveries/cancel";
import type { AppContext } from "../core/context";

const DiscoverBody = z
    .object({
        provider: z.string().openapi({ example: "linkedin" }),
        keywords: z.string().optional().openapi({ example: "backend engineer" }),
        location: z.string().optional().openapi({ example: "Brazil" }),
        workType: z.string().optional().openapi({
            example: "remote",
            description: "remote | hybrid | onsite",
        }),
        experienceLevel: z.array(z.string()).optional().openapi({
            example: ["mid_senior"],
            description: "entry | associate | mid_senior | director | executive",
        }),
        jobType: z.array(z.string()).optional().openapi({
            example: ["full_time"],
            description: "full_time | part_time | contract | temporary | internship",
        }),
        datePosted: z.string().optional().openapi({
            example: "week",
            description: "hour | hours6 | hours12 | day | week | month",
        }),
        maxJobs: z.number().int().positive().optional().openapi({ example: 50 }),
        options: z.record(z.string(), z.unknown()).optional().openapi({
            example: { easyApply: true },
            description: "Provider-specific options",
        }),
    })
    .openapi("DiscoverBody");

const DiscoveryIdParam = z.object({
    id: z.string().openapi({
        param: { name: "id", in: "path" },
        example: "550e8400-e29b-41d4-a716-446655440000",
    }),
});

export function createDiscoveriesRouter(ctx: AppContext): OpenAPIHono {
    const router = new OpenAPIHono();

    router.openapi(
        createRoute({
            method: "post",
            path: "/discoveries",
            tags: ["Discoveries"],
            summary: "Start an async job discovery. Returns 202 immediately.",
            request: {
                body: {
                    content: { "application/json": { schema: DiscoverBody } },
                    required: true,
                },
            },
            responses: {
                202: { description: "Discovery started" },
                409: { description: "A discovery is already running" },
            },
        }),
        async (c) => {
            const body = c.req.valid("json");
            try {
                const discovery = await startDiscovery(body, ctx);
                return c.json(discovery, 202);
            } catch (err) {
                throw new HTTPException(409, {
                    message: err instanceof Error ? err.message : String(err),
                });
            }
        },
    );

    router.openapi(
        createRoute({
            method: "get",
            path: "/discoveries",
            tags: ["Discoveries"],
            summary: "List all past and current discoveries",
            responses: {
                200: { description: "List of discoveries" },
            },
        }),
        async (c) => {
            const list = await listDiscoveries(ctx);
            return c.json({ discoveries: list });
        },
    );

    router.openapi(
        createRoute({
            method: "get",
            path: "/discoveries/{id}",
            tags: ["Discoveries"],
            summary: "Get the status of a discovery",
            request: { params: DiscoveryIdParam },
            responses: {
                200: { description: "Discovery status" },
                404: { description: "Not found" },
            },
        }),
        async (c) => {
            const { id } = c.req.valid("param");
            const discovery = await getDiscovery(id, ctx);
            if (!discovery) throw new HTTPException(404, { message: "Discovery not found" });
            return c.json(discovery);
        },
    );

    router.openapi(
        createRoute({
            method: "delete",
            path: "/discoveries/{id}",
            tags: ["Discoveries"],
            summary: "Cancel a running discovery",
            request: { params: DiscoveryIdParam },
            responses: {
                200: { description: "Cancelled" },
                404: { description: "Not found or not running" },
            },
        }),
        async (c) => {
            const { id } = c.req.valid("param");
            const cancelled = await cancelDiscovery(id, ctx);
            if (!cancelled) {
                throw new HTTPException(404, { message: "Discovery not found or not running" });
            }
            return c.json({ ok: true });
        },
    );

    return router;
}
```

- [ ] **Step 3: Substituir `src/routes/jobs.ts`**

```ts
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { listJobs } from "../core/jobs/list";
import { getJob } from "../core/jobs/get";
import type { AppContext } from "../core/context";

const JobIdParam = z.object({
    id: z.coerce.number().int().openapi({
        param: { name: "id", in: "path" },
        example: 1,
    }),
});

export function createJobsRouter(ctx: AppContext): OpenAPIHono {
    const router = new OpenAPIHono();

    router.openapi(
        createRoute({
            method: "get",
            path: "/jobs",
            tags: ["Jobs"],
            summary: "List all discovered jobs with their application status",
            responses: {
                200: { description: "List of jobs" },
            },
        }),
        async (c) => {
            const result = await listJobs(ctx);
            return c.json({ jobs: result });
        },
    );

    router.openapi(
        createRoute({
            method: "get",
            path: "/jobs/{id}",
            tags: ["Jobs"],
            summary: "Get a job with its application status and questions",
            request: { params: JobIdParam },
            responses: {
                200: { description: "Job detail with questions" },
                404: { description: "Job not found" },
            },
        }),
        async (c) => {
            const { id } = c.req.valid("param");
            const job = await getJob(id, ctx);
            if (!job) throw new HTTPException(404, { message: "Job not found" });
            return c.json(job);
        },
    );

    return router;
}
```

- [ ] **Step 4: Substituir `src/routes/auto-apply.ts`**

```ts
import { OpenAPIHono } from "@hono/zod-openapi";
import * as autoApplyManager from "../core/auto-apply/manager";
import type { AppContext } from "../core/context";

export function createAutoApplyRouter(ctx: AppContext): OpenAPIHono {
    const router = new OpenAPIHono();

    router.get("/auto-apply", (c) => c.json(autoApplyManager.getStatus()));

    router.post("/auto-apply/start", (c) => {
        autoApplyManager.start(ctx);
        return c.json({ ok: true });
    });

    router.post("/auto-apply/stop", (c) => {
        autoApplyManager.stop();
        return c.json({ ok: true });
    });

    return router;
}
```

- [ ] **Step 5: Verificar compilação**

```bash
cd /home/thelio/ez-job-applier/apps/backend && npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 6: Commit**

```bash
cd /home/thelio/ez-job-applier/apps/backend && git add src/routes/
git commit -m "refactor: convert routes to factory functions accepting AppContext"
```

---

## Task 12: Atualizar index.ts e limpar arquivos obsoletos

**Files:**
- Modify: `src/index.ts`
- Delete: `src/core/registry.ts`
- Delete: `src/repositories/jobs/` (directory)
- Delete: `src/repositories/applications/` (directory)

- [ ] **Step 1: Substituir `src/index.ts`**

```ts
import { serve } from "@hono/node-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { db, initDb } from "./db/client";
import { linkedinProvider } from "./providers/linkedin/index";
import { JobRepository } from "./infra/JobRepository";
import { ApplicationRepository } from "./infra/ApplicationRepository";
import { DiscoveryRepository } from "./infra/DiscoveryRepository";
import { ResumeRepository } from "./infra/ResumeRepository";
import { ProviderRegistry } from "./infra/ProviderRegistry";
import { createDiscoveriesRouter } from "./routes/discoveries";
import { createJobsRouter } from "./routes/jobs";
import { createApplicationsRouter } from "./routes/applications";
import { createAutoApplyRouter } from "./routes/auto-apply";
import resumesRouter from "./routes/resumes";
import settingsRouter from "./routes/settings";
import databaseRouter from "./routes/database";
import type { AppContext } from "./core/context";

await initDb();

const providerRegistry = new ProviderRegistry();
providerRegistry.register(linkedinProvider);

const ctx: AppContext = {
    jobRepo: new JobRepository(db),
    appRepo: new ApplicationRepository(db),
    discoveryRepo: new DiscoveryRepository(db),
    resumeRepo: new ResumeRepository(),
    providerRegistry,
};

const app = new OpenAPIHono();

app.use("*", cors());

app.onError((err, c) => {
    console.error(err);
    return c.json({ error: err.message }, 500);
});

app.route("/", createDiscoveriesRouter(ctx));
app.route("/", createJobsRouter(ctx));
app.route("/", createApplicationsRouter(ctx));
app.route("/", createAutoApplyRouter(ctx));
app.route("/", resumesRouter);
app.route("/", settingsRouter);
app.route("/", databaseRouter);

app.doc("/openapi", {
    openapi: "3.0.0",
    info: { title: "EZ Job Applier API", version: "1.0.0" },
    servers: [{ url: "http://localhost:3000" }],
});

app.get("/docs", apiReference({ url: "/openapi", theme: "saturn" }));

serve(
    {
        fetch: app.fetch,
        port: 3000,
    },
    (info) => {
        console.log(`Server is running on http://localhost:${info.port}`);
        console.log(`API docs available at http://localhost:${info.port}/docs`);
    },
);
```

- [ ] **Step 2: Verificar compilação completa**

```bash
cd /home/thelio/ez-job-applier/apps/backend && npx tsc --noEmit 2>&1
```

Esperado: zero erros. Se houver erros residuais de imports quebrados, corrigi-los antes de prosseguir.

- [ ] **Step 3: Remover arquivos obsoletos**

```bash
rm /home/thelio/ez-job-applier/apps/backend/src/core/registry.ts
rm -rf /home/thelio/ez-job-applier/apps/backend/src/repositories/jobs
rm -rf /home/thelio/ez-job-applier/apps/backend/src/repositories/applications
```

- [ ] **Step 4: Verificar compilação após remoção**

```bash
cd /home/thelio/ez-job-applier/apps/backend && npx tsc --noEmit 2>&1
```

Esperado: zero erros. Nenhum arquivo do core deve depender de `registry.ts`, `repositories/jobs/`, ou `repositories/applications/`.

- [ ] **Step 5: Commit final**

```bash
cd /home/thelio/ez-job-applier/apps/backend && git add -A
git commit -m "feat: complete core decoupling — AppContext, infra classes, route factories"
```

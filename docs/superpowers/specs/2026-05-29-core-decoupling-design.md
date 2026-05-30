# Design: Desacoplamento total do core dos providers e banco

**Data:** 2026-05-29  
**Escopo:** `apps/backend/src/`

---

## Problema

O `core/` importa diretamente:
- `db/client` e `db/schema` (Drizzle) — em `discoveries/start.ts` e `discoveries/worker.ts`
- Repositórios concretos (`repositories/…`) — em todos os use cases de `applications/`
- A constante `RESUMES_DIR` do filesystem — em `applications/apply.ts` e `get-questions.ts`

Isso impede testar o core isoladamente e acopla a lógica de negócio à tecnologia de persistência.

---

## Decisões de design

| Decisão | Escolha |
|---|---|
| Injeção de dependências | `AppContext` — objeto único passado como último parâmetro |
| Implementação dos repos | Classes TypeScript implementando as interfaces |
| Use cases do core | Funções stateless (sem classes) |
| Provider registry | Migra para `IProviderRegistry` dentro do `AppContext` |
| Router mounting | Factories `createXRouter(ctx)` em vez de instâncias estáticas |

---

## Arquitetura alvo

### Regra de dependência

```
routes → core (via AppContext) ← infra (implementa ports)
                                        ↓
                                    db/schema
```

O `core/` só importa de `core/`. Zero imports de `db/`, `repositories/`, ou `providers/`.

### Estrutura de arquivos

```
src/
├── core/
│   ├── ports.ts           ← interfaces: IJobRepo, IAppRepo, IDiscoveryRepo, IResumeRepo, IProviderRegistry
│   ├── context.ts         ← type AppContext (agrupa todos os ports)
│   ├── interfaces.ts      ← IJobProvider, IJobProviderSession (não muda)
│   ├── types.ts           ← tipos de domínio (não muda)
│   ├── registry.ts        ← REMOVIDO
│   ├── applications/
│   │   ├── apply.ts       ← recebe (jobId, answers, ctx)
│   │   ├── get-questions.ts ← recebe (jobId, ctx)
│   │   ├── skip.ts        ← recebe (jobId, ctx)
│   │   └── answer.ts      ← recebe (jobId, answers, ctx)
│   ├── discoveries/
│   │   ├── start.ts       ← recebe (config, ctx)
│   │   ├── worker.ts      ← recebe (id, config, ctx, signal)
│   │   ├── cancel.ts      ← recebe (id, ctx) ou não muda
│   │   ├── get.ts         ← recebe (id, ctx)
│   │   └── types.ts       ← não muda
│   └── auto-apply/
│       ├── manager.ts     ← não muda (estado em memória)
│       └── worker.ts      ← recebe ctx; delega para apply/get-questions com ctx
├── infra/
│   ├── JobRepository.ts          ← implements IJobRepo
│   ├── ApplicationRepository.ts  ← implements IAppRepo
│   ├── DiscoveryRepository.ts    ← implements IDiscoveryRepo
│   ├── ResumeRepository.ts       ← implements IResumeRepo
│   └── ProviderRegistry.ts       ← implements IProviderRegistry
├── db/                    ← não muda
├── providers/             ← não muda
├── repositories/          ← REMOVIDO (migrado para infra/)
└── index.ts               ← monta AppContext, registra provider, sobe servidor
```

---

## Interfaces (core/ports.ts)

```ts
import type { Job, DiscoverConfig, ApplicationQuestion, ApplicationStatus } from "./types"
import type { IJobProvider } from "./interfaces"

export interface IJobRepo {
  getById(id: number): Promise<Job | null>
  getByProvider(provider: string, externalId: string): Promise<Job | null>
  listIds(provider?: string): Promise<Set<string>>
  save(job: Job): Promise<void>
}

export interface ApplicationRecord {
  id: number
  status: ApplicationStatus
  resumeFilename: string | null
  errorMessage: string | null
}

export interface IAppRepo {
  get(provider: string, externalId: string): Promise<ApplicationRecord | null>
  upsert(
    provider: string,
    externalId: string,
    status: ApplicationStatus,
    resumeFilename?: string,
    errorMessage?: string,
  ): Promise<ApplicationRecord>
  updateStatus(id: number, status: ApplicationStatus, errorMessage?: string): Promise<void>
  replaceQuestions(appId: number, questions: ApplicationQuestion[]): Promise<void>
  getQuestions(appId: number): Promise<ApplicationQuestion[]>
  answerQuestions(appId: number, answers: Record<string, string>): Promise<void>
  listIdsByStatus(status: ApplicationStatus): Promise<number[]>
  listFoundJobIds(): Promise<number[]>
}

export interface DiscoveryRecord {
  id: string
  provider: string
  config: DiscoverConfig
  status: string
  discovered: number
  startedAt: string
  finishedAt: string | null
  errorMessage: string | null
}

export interface IDiscoveryRepo {
  isRunning(): Promise<boolean>
  create(id: string, config: DiscoverConfig): Promise<void>
  incrementDiscovered(id: string): Promise<void>
  finish(id: string, status: string, errorMessage?: string): Promise<void>
  get(id: string): Promise<DiscoveryRecord | null>
  list(): Promise<DiscoveryRecord[]>
}

export interface IResumeRepo {
  /** Retorna o path absoluto do resume padrão, ou undefined se nenhum configurado */
  getDefaultResumePath(): Promise<string | undefined>
}

export interface IProviderRegistry {
  register(provider: IJobProvider): void
  get(name: string): IJobProvider
  getForJob(job: Job): IJobProvider
}
```

---

## AppContext (core/context.ts)

```ts
import type { IJobRepo, IAppRepo, IDiscoveryRepo, IResumeRepo, IProviderRegistry } from "./ports"

export interface AppContext {
  jobRepo: IJobRepo
  appRepo: IAppRepo
  discoveryRepo: IDiscoveryRepo
  resumeRepo: IResumeRepo
  providerRegistry: IProviderRegistry
}
```

---

## Exemplo: use case apply (core/applications/apply.ts)

```ts
import type { AppContext } from "../context"
import type { ApplyResult } from "../types"

export async function applyToJob(
  jobId: number,
  answers: Record<string, string> = {},
  ctx: AppContext,
): Promise<ApplyResult> {
  const job = await ctx.jobRepo.getById(jobId)
  if (!job) throw new Error(`Job ${jobId} not found`)

  const existing = await ctx.appRepo.get(job.provider, job.jobId)
  if (existing) {
    const persisted = await ctx.appRepo.getQuestions(existing.id)
    for (const q of persisted) {
      if (q.answer && !answers[q.label]) answers[q.label] = q.answer
    }
  }

  const resumePath = await ctx.resumeRepo.getDefaultResumePath()
  const provider = ctx.providerRegistry.getForJob(job)
  const session = await provider.createSession()

  try {
    const result = await session.apply(job, answers, resumePath)
    const application = await ctx.appRepo.upsert(job.provider, job.jobId, result.status, undefined, result.errorMessage)
    await ctx.appRepo.replaceQuestions(application.id, result.questions)
    return result
  } finally {
    await session.close()
  }
}
```

---

## Montagem em index.ts

```ts
import { JobRepository } from "./infra/JobRepository"
import { ApplicationRepository } from "./infra/ApplicationRepository"
import { DiscoveryRepository } from "./infra/DiscoveryRepository"
import { ResumeRepository } from "./infra/ResumeRepository"
import { ProviderRegistry } from "./infra/ProviderRegistry"
import { initDb } from "./db/client"

const db = await initDb()

const ctx: AppContext = {
  jobRepo: new JobRepository(db),
  appRepo: new ApplicationRepository(db),
  discoveryRepo: new DiscoveryRepository(db),
  resumeRepo: new ResumeRepository(),
  providerRegistry: new ProviderRegistry(),
}

ctx.providerRegistry.register(linkedinProvider)

app.route("/", createApplicationsRouter(ctx))
app.route("/", createDiscoveriesRouter(ctx))
app.route("/", createJobsRouter(ctx))
app.route("/", createResumesRouter(ctx))
app.route("/", createAutoApplyRouter(ctx))
app.route("/", createSettingsRouter(ctx))
app.route("/", createDatabaseRouter(ctx))
```

---

## O que NÃO muda

- `core/interfaces.ts` — `IJobProvider`, `IJobProviderSession`
- `core/types.ts` — todos os tipos de domínio
- `providers/linkedin/` — implementação do provider
- `db/schema.ts` e `db/client.ts`
- `repositories/resumes/services/settings.ts` e `storage.ts` — migram para `infra/ResumeRepository.ts`

---

## Checklist de implementação (visão geral)

1. Criar `core/ports.ts` e `core/context.ts`
2. Criar `infra/` com as 5 classes (`JobRepository`, `ApplicationRepository`, `DiscoveryRepository`, `ResumeRepository`, `ProviderRegistry`)
3. Refatorar `core/applications/*.ts` — adicionar `ctx: AppContext`, remover imports de infra
4. Refatorar `core/discoveries/*.ts` — idem; remover imports diretos de `db/`
5. Refatorar `core/auto-apply/worker.ts` — repassar `ctx` ao chamar use cases
6. Transformar `routes/*.ts` em factories `createXRouter(ctx)`
7. Atualizar `index.ts` — montar `ctx`, chamar factories
8. Remover `core/registry.ts` e `repositories/` (após migração)

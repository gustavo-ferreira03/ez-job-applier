# Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir o frontend do zero — dark/minimal, sidebar com ícones SVG, kanban com cards ricos, drawer deslizante, tabela power e histórico de discoveries. UI em pt-BR.

**Architecture:** Layout de app shell com sidebar fixa (196px) + área principal que troca de view via roteamento em estado (não SvelteKit routes). Drawer de 320px desliza por cima do conteúdo principal. Todos os componentes antigos são deletados e recriados do zero.

**Tech Stack:** SvelteKit, Svelte 5 (runes), Tailwind CSS v4, Lucide Svelte, TypeScript.

---

## Estrutura de Arquivos

**Deletar:**
- `src/lib/components/AppHeader.svelte`
- `src/lib/components/DiscoverModal.svelte`
- `src/lib/components/JobActionsModal.svelte`
- `src/lib/components/SettingsModal.svelte`
- `src/lib/components/kanban/KanbanBoard.svelte`
- `src/lib/components/kanban/KanbanCard.svelte`
- `src/lib/components/kanban/KanbanColumn.svelte`

**Manter sem alteração:**
- `src/lib/api.ts` (adicionar `listDiscoveries`)
- `src/lib/components/Toast.svelte`
- `src/lib/toast.svelte.ts`
- `src/routes/+layout.svelte`

**Criar/Reescrever:**
```
src/routes/layout.css                        ← reescrever tema zinc/dark
src/lib/types.ts                             ← adicionar tipo Page
src/lib/api.ts                               ← adicionar listDiscoveries()
src/lib/state.svelte.ts                      ← adicionar discoveries[]
src/lib/components/StatusBadge.svelte        ← novo
src/lib/components/Sidebar.svelte            ← novo
src/lib/components/kanban/KanbanCard.svelte  ← reescrever
src/lib/components/kanban/KanbanColumn.svelte← reescrever
src/lib/components/kanban/KanbanBoard.svelte ← reescrever
src/lib/components/JobDrawer.svelte          ← novo (substitui JobActionsModal)
src/lib/components/JobTable.svelte           ← novo
src/lib/components/DiscoveryModal.svelte     ← novo (substitui DiscoverModal)
src/lib/components/DiscoveriesView.svelte    ← novo
src/lib/components/SettingsView.svelte       ← novo (substitui SettingsModal)
src/routes/+page.svelte                      ← reescrever
```

---

## Task 1: Limpar arquivos antigos + reescrever tema CSS

**Files:**
- Delete: todos os componentes listados acima
- Modify: `src/routes/layout.css`

- [ ] **Step 1: Deletar componentes antigos**

```bash
cd apps/frontend
rm src/lib/components/AppHeader.svelte
rm src/lib/components/DiscoverModal.svelte
rm src/lib/components/JobActionsModal.svelte
rm src/lib/components/SettingsModal.svelte
rm src/lib/components/kanban/KanbanBoard.svelte
rm src/lib/components/kanban/KanbanCard.svelte
rm src/lib/components/kanban/KanbanColumn.svelte
```

- [ ] **Step 2: Reescrever `src/routes/layout.css` com tema zinc/dark**

Substituir TODO o conteúdo por:

```css
@import 'tailwindcss';

@theme {
  --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  /* ─── Fundos ──────────────────────────────────────────────── */
  --color-surface-base:    #0d0d0f;
  --color-surface-raised:  #111113;
  --color-surface-overlay: #18181b;
  --color-surface-sidebar: #0a0a0c;
  --color-surface-hover:   #1c1c20;

  /* ─── Bordas ──────────────────────────────────────────────── */
  --color-border-subtle:  #1c1c20;
  --color-border-default: #27272a;
  --color-border-strong:  #3f3f46;

  /* ─── Texto ───────────────────────────────────────────────── */
  --color-text-primary:     #e4e4e7;
  --color-text-secondary:   #a1a1aa;
  --color-text-muted:       #71717a;
  --color-text-faint:       #52525b;
  --color-text-placeholder: #3f3f46;

  /* ─── Acento (azul) ───────────────────────────────────────── */
  --color-accent-500:  #2563eb;
  --color-accent-600:  #1d4ed8;
  --color-accent-text: #ffffff;

  /* ─── Status ──────────────────────────────────────────────── */
  --color-status-found-bg:      #1c1c20;
  --color-status-found-text:    #71717a;
  --color-status-input-bg:      #2d2508;
  --color-status-input-text:    #ca8a04;
  --color-status-input-border:  #2a2208;
  --color-status-review-bg:     #1e3a5f;
  --color-status-review-text:   #3b82f6;
  --color-status-review-border: #1a2f4a;
  --color-status-external-bg:   #2e1065;
  --color-status-external-text: #a855f7;
  --color-status-external-border: #2a1040;
  --color-status-submitted-bg:   #052e16;
  --color-status-submitted-text: #22c55e;
  --color-status-submitted-border: #0a3d1c;
  --color-status-failed-bg:    #1c0a0a;
  --color-status-failed-text:  #ef4444;

  /* ─── Auto-apply ──────────────────────────────────────────── */
  --color-autoapply-bg:   #14532d;
  --color-autoapply-text: #86efac;

  /* ─── Danger ──────────────────────────────────────────────── */
  --color-danger-500: #ef4444;
  --color-danger-600: #dc2626;
  --color-danger-bg:  #1c0a0a;

  /* ─── Success ─────────────────────────────────────────────── */
  --color-success-500: #22c55e;

  /* ─── Z-index ─────────────────────────────────────────────── */
  --z-drawer: 50;
  --z-modal:  100;
  --z-toast:  200;

  /* ─── Shadows ─────────────────────────────────────────────── */
  --shadow-drawer: -12px 0 32px rgb(0 0 0 / 0.6);
  --shadow-modal:  0 24px 56px rgb(0 0 0 / 0.7);
}
```

- [ ] **Step 3: Verificar que o projeto ainda compila**

```bash
cd apps/frontend && pnpm check
```

Esperado: erros de componentes não encontrados (AppHeader, etc.) — isso é normal porque os componentes foram deletados. Os erros vão desaparecer quando recriarmos tudo.

- [ ] **Step 4: Commit**

```bash
cd apps/frontend
git add src/routes/layout.css
git commit -m "feat: rewrite CSS theme to zinc/dark palette"
```

---

## Task 2: Foundation — api.ts, types.ts, state.svelte.ts

**Files:**
- Modify: `src/lib/api.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/state.svelte.ts`

- [ ] **Step 1: Adicionar `listDiscoveries` em `src/lib/api.ts`**

Adicionar após a função `cancelDiscovery`:

```typescript
export function listDiscoveries(): Promise<{ discoveries: DiscoveryJob[] }> {
	return get('/discoveries');
}
```

- [ ] **Step 2: Adicionar tipo `Page` em `src/lib/types.ts`**

Adicionar no final do arquivo:

```typescript
export type Page = 'pipeline' | 'tabela' | 'discoveries' | 'configuracoes';
```

- [ ] **Step 3: Atualizar `src/lib/state.svelte.ts`**

Substituir TODO o conteúdo por:

```typescript
import { getResumes, listJobs, getDiscovery, getAutoApplyStatus, getAppSettings, listDiscoveries } from './api';
import type { AppSettings, AutoApplyStatus, DiscoverConfig, DiscoveryJob, JobSummary } from './types';

function defaultConfig(): DiscoverConfig {
	return { provider: 'linkedin', options: { easyApply: true } };
}

class AppState {
	jobs = $state<JobSummary[]>([]);
	discoveries = $state<DiscoveryJob[]>([]);
	activeDiscovery = $state<DiscoveryJob | null>(null);
	autoApply = $state<AutoApplyStatus>({ running: false, applied: 0, failed: 0 });
	settings = $state<AppSettings>({ browserVisible: false, searchLocale: 'pt-BR' });
	resumes = $state<string[]>([]);
	defaultResume = $state<string | null>(null);
	discoverConfig = $state<DiscoverConfig>(defaultConfig());

	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private autoApplyTimer: ReturnType<typeof setInterval> | null = null;
	private backgroundTimer: ReturnType<typeof setInterval> | null = null;

	async init() {
		try {
			const [jobsRes, resumesRes, autoApplyRes, settingsRes, discoveriesRes] = await Promise.all([
				listJobs(),
				getResumes(),
				getAutoApplyStatus(),
				getAppSettings(),
				listDiscoveries()
			]);
			this.jobs = jobsRes.jobs;
			this.resumes = resumesRes.resumes;
			this.defaultResume = resumesRes.default;
			this.autoApply = autoApplyRes;
			this.settings = settingsRes;
			this.discoveries = discoveriesRes.discoveries;

			const running = discoveriesRes.discoveries.find((d) => d.status === 'running');
			if (running) {
				this.activeDiscovery = running;
				this.startPolling(running.id);
			}
			if (autoApplyRes.running) this.startAutoApplyPolling();
			this.startBackgroundPolling();
		} catch (e) {
			console.error('Failed to load state:', e);
		}
	}

	async refreshJobs() {
		try {
			const res = await listJobs();
			this.jobs = res.jobs;
		} catch (e) {
			console.error('Failed to refresh jobs:', e);
		}
	}

	async refreshDiscoveries() {
		try {
			const res = await listDiscoveries();
			this.discoveries = res.discoveries;
		} catch (e) {
			console.error('Failed to refresh discoveries:', e);
		}
	}

	startPolling(discoveryId: string) {
		this.stopPolling();
		this.pollTimer = setInterval(async () => {
			try {
				const updated = await getDiscovery(discoveryId);
				this.activeDiscovery = updated;
				this.discoveries = this.discoveries.map((d) => (d.id === updated.id ? updated : d));
				if (updated.status !== 'running') {
					this.stopPolling();
					this.activeDiscovery = null;
				}
			} catch (e) {
				console.error('Discovery poll failed:', e);
			}
		}, 2000);
	}

	stopPolling() {
		if (this.pollTimer !== null) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	}

	startAutoApplyPolling() {
		this.stopAutoApplyPolling();
		this.autoApplyTimer = setInterval(async () => {
			try {
				const status = await getAutoApplyStatus();
				this.autoApply = status;
				if (!status.running) this.stopAutoApplyPolling();
			} catch (e) {
				console.error('Auto-apply poll failed:', e);
			}
		}, 2000);
	}

	stopAutoApplyPolling() {
		if (this.autoApplyTimer !== null) {
			clearInterval(this.autoApplyTimer);
			this.autoApplyTimer = null;
		}
	}

	startBackgroundPolling() {
		if (this.backgroundTimer !== null) return;
		this.backgroundTimer = setInterval(() => this.refreshJobs(), 5000);
	}
}

export const appState = new AppState();
```

- [ ] **Step 4: Verificar tipos**

```bash
cd apps/frontend && pnpm check
```

Esperado: erros de módulos não encontrados (componentes deletados) — ainda normal.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/api.ts apps/frontend/src/lib/types.ts apps/frontend/src/lib/state.svelte.ts
git commit -m "feat: add discoveries list, Page type, update AppState"
```

---

## Task 3: StatusBadge

**Files:**
- Create: `src/lib/components/StatusBadge.svelte`

- [ ] **Step 1: Criar `src/lib/components/StatusBadge.svelte`**

```svelte
<script lang="ts">
	import type { ApplicationStatus } from '$lib/types';

	interface Props {
		status: ApplicationStatus;
		size?: 'sm' | 'md';
	}

	let { status, size = 'md' }: Props = $props();

	const labels: Record<ApplicationStatus, string> = {
		FOUND: 'Encontrada',
		NEEDS_INPUT: 'Precisa Resposta',
		READY_FOR_REVIEW: 'Revisar',
		EXTERNAL: 'Externa',
		SUBMITTED: 'Enviada',
		SKIPPED: 'Ignorada',
		FAILED: 'Falhou'
	};

	const styles: Record<ApplicationStatus, string> = {
		FOUND:            'bg-[#1c1c20] text-[#71717a]',
		NEEDS_INPUT:      'bg-[#2d2508] text-[#ca8a04]',
		READY_FOR_REVIEW: 'bg-[#1e3a5f] text-[#3b82f6]',
		EXTERNAL:         'bg-[#2e1065] text-[#a855f7]',
		SUBMITTED:        'bg-[#052e16] text-[#22c55e]',
		SKIPPED:          'bg-[#1c1c20] text-[#52525b]',
		FAILED:           'bg-[#1c0a0a] text-[#ef4444]'
	};

	const padding = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';
</script>

<span class="inline-block rounded-sm font-medium {padding} {styles[status]}">
	{labels[status]}
</span>
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/lib/components/StatusBadge.svelte
git commit -m "feat: add StatusBadge component (pt-BR labels)"
```

---

## Task 4: Sidebar

**Files:**
- Create: `src/lib/components/Sidebar.svelte`

- [ ] **Step 1: Criar `src/lib/components/Sidebar.svelte`**

```svelte
<script lang="ts">
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import List from '@lucide/svelte/icons/list';
	import Search from '@lucide/svelte/icons/search';
	import Settings from '@lucide/svelte/icons/settings';
	import Bot from '@lucide/svelte/icons/bot';
	import type { AutoApplyStatus, Page } from '$lib/types';

	interface Props {
		activePage: Page;
		autoApply: AutoApplyStatus;
		isDiscovering: boolean;
		discoveredCount: number;
		onNavigate: (page: Page) => void;
		onStartDiscovery: () => void;
		onToggleAutoApply: () => void;
		onStopDiscovery: () => void;
	}

	let {
		activePage,
		autoApply,
		isDiscovering,
		discoveredCount,
		onNavigate,
		onStartDiscovery,
		onToggleAutoApply,
		onStopDiscovery
	}: Props = $props();

	const navItems: { page: Page; label: string; icon: typeof LayoutDashboard }[] = [
		{ page: 'pipeline',       label: 'Pipeline',       icon: LayoutDashboard },
		{ page: 'tabela',         label: 'Tabela',         icon: List },
		{ page: 'discoveries',    label: 'Discoveries',    icon: Search },
		{ page: 'configuracoes',  label: 'Configurações',  icon: Settings }
	];
</script>

<aside class="flex h-full w-[196px] flex-shrink-0 flex-col border-r border-border-subtle bg-surface-sidebar">
	<!-- Logo -->
	<div class="flex h-14 flex-shrink-0 items-center border-b border-border-subtle px-4">
		<span class="text-sm font-extrabold tracking-tight text-text-primary">
			EZ<span class="text-accent-500">Job</span>Applier
		</span>
	</div>

	<!-- Nav -->
	<nav class="flex-1 overflow-y-auto p-2" aria-label="Navegação principal">
		{#each navItems as item (item.page)}
			<button
				type="button"
				class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors duration-100 focus-visible:outline-none
					{activePage === item.page
						? 'bg-surface-overlay text-text-primary'
						: 'text-text-faint hover:bg-surface-hover hover:text-text-muted'}"
				onclick={() => onNavigate(item.page)}
			>
				<item.icon size={15} strokeWidth={activePage === item.page ? 2.25 : 1.75} aria-hidden="true" />
				{item.label}
			</button>
		{/each}
	</nav>

	<!-- Ações -->
	<div class="flex flex-shrink-0 flex-col gap-1.5 border-t border-border-subtle p-2">
		<!-- Auto-apply -->
		{#if autoApply.running}
			<button
				type="button"
				class="flex w-full items-center gap-2 rounded-md bg-autoapply-bg px-2.5 py-2 text-[12px] font-semibold text-autoapply-text transition-opacity hover:opacity-80 focus-visible:outline-none"
				title="Clique para parar"
				onclick={onToggleAutoApply}
			>
				<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-autoapply-text"></span>
				Auto-apply ativo
				{#if autoApply.applied > 0}
					<span class="ml-auto text-[11px] opacity-70">{autoApply.applied}</span>
				{/if}
			</button>
		{:else}
			<button
				type="button"
				class="flex w-full items-center gap-2 rounded-md bg-surface-overlay px-2.5 py-2 text-[12px] font-medium text-text-faint hover:bg-surface-hover hover:text-text-muted focus-visible:outline-none"
				onclick={onToggleAutoApply}
			>
				<Bot size={14} strokeWidth={1.75} aria-hidden="true" />
				Auto-apply
			</button>
		{/if}

		<!-- Discover -->
		{#if isDiscovering}
			<button
				type="button"
				class="flex w-full items-center gap-2 rounded-md bg-[#2a2208] px-2.5 py-2 text-[12px] font-semibold text-[#ca8a04] hover:opacity-80 focus-visible:outline-none"
				title="Clique para cancelar"
				onclick={onStopDiscovery}
			>
				<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ca8a04]"></span>
				Descobrindo...
				<span class="ml-auto text-[11px] opacity-70">{discoveredCount}</span>
			</button>
		{:else}
			<button
				type="button"
				class="flex w-full items-center gap-2 rounded-md bg-accent-500 px-2.5 py-2 text-[12px] font-semibold text-white hover:bg-accent-600 focus-visible:outline-none"
				onclick={onStartDiscovery}
			>
				<Search size={13} strokeWidth={2.25} aria-hidden="true" />
				Nova descoberta
			</button>
		{/if}
	</div>
</aside>
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/lib/components/Sidebar.svelte
git commit -m "feat: add Sidebar component"
```

---

## Task 5: KanbanCard + KanbanColumn + KanbanBoard

**Files:**
- Create: `src/lib/components/kanban/KanbanCard.svelte`
- Create: `src/lib/components/kanban/KanbanColumn.svelte`
- Create: `src/lib/components/kanban/KanbanBoard.svelte`

- [ ] **Step 1: Criar `src/lib/components/kanban/KanbanCard.svelte`**

```svelte
<script lang="ts">
	import type { JobSummary, KanbanTab } from '$lib/types';

	interface Props {
		job: JobSummary;
		defaultTab: KanbanTab;
		onOpen: (job: JobSummary, tab: KanbanTab) => void;
	}

	let { job, defaultTab, onOpen }: Props = $props();

	function relativeDate(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const days = Math.floor(diff / 86_400_000);
		if (days === 0) return 'hoje';
		if (days === 1) return '1d';
		return `${days}d`;
	}

	const contractMap: Record<string, string> = {
		full_time: 'CLT', part_time: 'Part-time', contract: 'PJ', temporary: 'Temp', internship: 'Estágio'
	};
</script>

<button
	type="button"
	class="w-full rounded-md border border-border-subtle bg-surface-raised p-2.5 text-left transition-colors duration-100 hover:border-border-default focus-visible:outline-none"
	onclick={() => onOpen(job, defaultTab)}
>
	<!-- Título -->
	<p class="truncate text-[12px] font-medium text-text-primary">{job.title}</p>

	<!-- Empresa · Local -->
	<p class="mt-0.5 truncate text-[11px] text-text-faint">
		{job.company}
		{#if job.location}<span class="text-text-faint opacity-60"> · {job.location}</span>{/if}
	</p>

	<!-- Skills -->
	{#if job.skills.length > 0}
		<div class="mt-2 flex flex-wrap gap-1">
			{#each job.skills.slice(0, 3) as skill (skill)}
				<span class="rounded-sm bg-surface-hover px-1.5 py-0.5 text-[10px] text-text-faint">{skill}</span>
			{/each}
			{#if job.skills.length > 3}
				<span class="rounded-sm bg-surface-hover px-1.5 py-0.5 text-[10px] text-text-faint">+{job.skills.length - 3}</span>
			{/if}
		</div>
	{/if}

	<!-- Rodapé -->
	<div class="mt-2 flex items-center justify-between border-t border-border-subtle pt-1.5">
		<div class="flex items-center gap-1.5">
			{#if job.unansweredCount > 0}
				<span class="rounded-sm bg-[#431407] px-1.5 py-0.5 text-[10px] font-medium text-[#f97316]">
					{job.unansweredCount} sem resp.
				</span>
			{:else if job.status === 'READY_FOR_REVIEW'}
				<span class="rounded-sm bg-[#1e3a5f] px-1.5 py-0.5 text-[10px] font-medium text-[#3b82f6]">
					Pronto p/ enviar
				</span>
			{/if}
		</div>
		<span class="text-[10px] text-text-faint">{relativeDate(job.createdAt)}</span>
	</div>
</button>
```

- [ ] **Step 2: Criar `src/lib/components/kanban/KanbanColumn.svelte`**

```svelte
<script lang="ts">
	import KanbanCard from './KanbanCard.svelte';
	import type { JobSummary, KanbanTab } from '$lib/types';

	interface ColumnDef {
		id: string;
		title: string;
		statuses: string[];
		defaultTab: KanbanTab;
		headerClass: string;
	}

	interface Props {
		column: ColumnDef;
		jobs: JobSummary[];
		onOpenJob: (job: JobSummary, tab: KanbanTab) => void;
	}

	let { column, jobs, onOpenJob }: Props = $props();
</script>

<div class="flex w-[200px] flex-shrink-0 flex-col gap-2">
	<!-- Cabeçalho -->
	<div class="flex items-center justify-between px-0.5">
		<span class="text-[11px] font-semibold uppercase tracking-wide {column.headerClass}">
			{column.title}
		</span>
		<span class="text-[11px] text-text-faint">{jobs.length}</span>
	</div>

	<!-- Cards -->
	<div class="flex flex-col gap-2">
		{#each jobs as job (job.id)}
			<KanbanCard {job} defaultTab={column.defaultTab} onOpen={onOpenJob} />
		{/each}

		{#if jobs.length === 0}
			<div class="rounded-md border border-dashed border-border-subtle py-6 text-center text-[11px] text-text-faint">
				Vazio
			</div>
		{/if}
	</div>
</div>
```

- [ ] **Step 3: Criar `src/lib/components/kanban/KanbanBoard.svelte`**

```svelte
<script lang="ts">
	import KanbanColumn from './KanbanColumn.svelte';
	import type { JobSummary, KanbanTab } from '$lib/types';

	interface Props {
		jobs: JobSummary[];
		onOpenJob: (job: JobSummary, tab: KanbanTab) => void;
	}

	let { jobs, onOpenJob }: Props = $props();

	const columns = [
		{
			id: 'found',
			title: 'Encontradas',
			statuses: ['FOUND'],
			defaultTab: 'info' as KanbanTab,
			headerClass: 'text-text-muted'
		},
		{
			id: 'needs-input',
			title: 'Precisa Resposta',
			statuses: ['NEEDS_INPUT'],
			defaultTab: 'actions' as KanbanTab,
			headerClass: 'text-[#ca8a04]'
		},
		{
			id: 'review',
			title: 'Revisar',
			statuses: ['READY_FOR_REVIEW'],
			defaultTab: 'actions' as KanbanTab,
			headerClass: 'text-[#3b82f6]'
		},
		{
			id: 'external',
			title: 'Externa',
			statuses: ['EXTERNAL'],
			defaultTab: 'actions' as KanbanTab,
			headerClass: 'text-[#a855f7]'
		},
		{
			id: 'submitted',
			title: 'Enviadas',
			statuses: ['SUBMITTED'],
			defaultTab: 'info' as KanbanTab,
			headerClass: 'text-[#22c55e]'
		},
		{
			id: 'done',
			title: 'Ignoradas / Falhas',
			statuses: ['SKIPPED', 'FAILED'],
			defaultTab: 'info' as KanbanTab,
			headerClass: 'text-text-faint'
		}
	];

	function jobsForColumn(col: (typeof columns)[0]) {
		return jobs.filter((j) => col.statuses.includes(j.status));
	}
</script>

<section
	class="flex h-full gap-4 overflow-x-auto p-4"
	aria-label="Pipeline de candidaturas"
>
	{#each columns as col (col.id)}
		<KanbanColumn column={col} jobs={jobsForColumn(col)} onOpenJob={onOpenJob} />
	{/each}
</section>
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/lib/components/kanban/
git commit -m "feat: add KanbanCard, KanbanColumn, KanbanBoard"
```

---

## Task 6: JobDrawer

**Files:**
- Create: `src/lib/components/JobDrawer.svelte`

- [ ] **Step 1: Criar `src/lib/components/JobDrawer.svelte`**

```svelte
<script lang="ts">
	import { fly } from 'svelte/transition';
	import { onMount } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import * as api from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import type { JobDetail, JobSummary, KanbanTab } from '$lib/types';

	interface Props {
		job: JobSummary;
		initialTab?: KanbanTab;
		onClose: () => void;
	}

	let { job, initialTab = 'info', onClose }: Props = $props();

	let detail = $state<JobDetail | null>(null);
	let loadError = $state(false);
	let activeTab = $state<KanbanTab>(initialTab);
	let busy = $state(false);
	let notice = $state('');
	let answerInputs = $state<Record<string, string>>({});
	let selectedResume = $state(job.resumeFilename ?? '');

	onMount(async () => {
		try {
			detail = await api.getJob(job.id);
			selectedResume = detail.resumeFilename ?? '';
			if (job.status === 'READY_FOR_REVIEW') {
				for (const q of detail.questions) {
					if (q.answer != null) answerInputs[q.label] = q.answer;
				}
			}
		} catch {
			loadError = true;
		}
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	const unanswered = $derived(detail?.questions.filter((q) => q.answer == null) ?? []);
	const answered   = $derived(detail?.questions.filter((q) => q.answer != null) ?? []);
	const canSave    = $derived(unanswered.every((q) => answerInputs[q.label]?.trim()));

	const hasActions = $derived(
		['FOUND', 'NEEDS_INPUT', 'READY_FOR_REVIEW', 'EXTERNAL', 'FAILED'].includes(job.status)
	);

	async function handleGetQuestions() {
		if (busy) return;
		busy = true; notice = 'Abrindo formulário…';
		try {
			await api.getQuestions(job.id);
			toastState.show('Perguntas extraídas');
			onClose();
			await appState.refreshJobs();
		} catch { notice = ''; toastState.show('Falha ao extrair perguntas'); }
		finally { busy = false; }
	}

	async function handleSaveAnswers() {
		if (busy) return;
		busy = true; notice = 'Salvando…';
		try {
			const answers: Record<string, string> = {};
			for (const q of unanswered) {
				if (answerInputs[q.label]?.trim()) answers[q.label] = answerInputs[q.label].trim();
			}
			await api.saveAnswers(job.id, answers);
			toastState.show('Respostas salvas');
			onClose();
			await appState.refreshJobs();
		} catch { notice = ''; toastState.show('Falha ao salvar respostas'); }
		finally { busy = false; }
	}

	async function handleApply() {
		if (busy) return;
		busy = true; notice = 'Enviando candidatura…';
		try {
			if (Object.keys(answerInputs).length > 0) await api.saveAnswers(job.id, answerInputs);
			await api.applyToJob(job.id, answerInputs, selectedResume || undefined);
			toastState.show('Candidatura enviada');
			onClose();
			await appState.refreshJobs();
		} catch { notice = ''; toastState.show('Falha ao enviar candidatura'); }
		finally { busy = false; }
	}

	async function handleSkip() {
		if (busy) return;
		busy = true;
		try {
			await api.skipJob(job.id);
			toastState.show('Vaga ignorada');
			onClose();
			await appState.refreshJobs();
		} catch { toastState.show('Falha ao ignorar vaga'); }
		finally { busy = false; }
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Backdrop -->
<div
	class="fixed inset-0 z-drawer bg-transparent"
	role="presentation"
	onclick={onClose}
></div>

<!-- Painel -->
<div
	class="fixed right-0 top-0 z-drawer flex h-full w-[340px] flex-col border-l border-border-default bg-surface-raised shadow-[var(--shadow-drawer)]"
	role="dialog"
	aria-modal="true"
	aria-label="Detalhes da vaga"
	transition:fly={{ x: 340, duration: 220, opacity: 1 }}
	onclick={(e) => e.stopPropagation()}
>
	<!-- Cabeçalho -->
	<div class="flex-shrink-0 border-b border-border-subtle px-4 pb-0 pt-4">
		<div class="mb-3 flex items-start justify-between gap-3">
			<div class="min-w-0 flex-1">
				<h2 class="truncate text-[13px] font-semibold text-text-primary">{job.title}</h2>
				<p class="mt-0.5 text-[11px] text-text-muted">
					{job.company}
					{#if job.location} · {job.location}{/if}
				</p>
				<div class="mt-2 flex items-center gap-2">
					<StatusBadge status={job.status} size="sm" />
					{#if job.url}
						<a
							href={job.url}
							target="_blank"
							rel="noreferrer noopener"
							class="flex items-center gap-1 text-[10px] text-text-faint hover:text-text-muted"
						>
							<ExternalLink size={10} aria-hidden="true" />
							LinkedIn
						</a>
					{/if}
				</div>
			</div>
			<button
				type="button"
				class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-text-faint hover:bg-surface-overlay hover:text-text-muted focus-visible:outline-none"
				onclick={onClose}
				aria-label="Fechar"
			>
				<X size={14} aria-hidden="true" />
			</button>
		</div>

		<!-- Abas -->
		<div class="flex" role="tablist">
			{#each (['info', 'actions'] as KanbanTab[]) as tab (tab)}
				<button
					role="tab"
					aria-selected={activeTab === tab}
					class="border-b-2 px-3 py-2 text-[12px] font-medium transition-colors duration-100
						{activeTab === tab
							? 'border-text-primary text-text-primary'
							: 'border-transparent text-text-faint hover:text-text-muted'}"
					onclick={() => { activeTab = tab; }}
				>
					{tab === 'info' ? 'Informações' : 'Ações'}
				</button>
			{/each}
		</div>
	</div>

	<!-- Conteúdo -->
	<div class="flex-1 overflow-y-auto p-4">
		{#if loadError}
			<p class="text-[12px] text-[#ef4444]">Falha ao carregar detalhes da vaga.</p>
		{:else if !detail}
			<div class="flex items-center justify-center py-16 text-text-faint">
				<LoaderCircle size={20} class="animate-spin" aria-label="Carregando" />
			</div>
		{:else if activeTab === 'info'}
			<!-- Aba Informações -->
			{#if detail.errorMessage}
				<div class="mb-4 rounded-md bg-[#1c0a0a] px-3 py-2 text-[11px] text-[#ef4444]">
					{detail.errorMessage}
				</div>
			{/if}

			{#if detail.applicationUrl}
				<div class="mb-4">
					<a
						href={detail.applicationUrl}
						target="_blank"
						rel="noreferrer noopener"
						class="flex items-center gap-1.5 text-[12px] text-[#3b82f6] hover:underline"
					>
						<ExternalLink size={12} aria-hidden="true" />
						Candidatura externa
					</a>
				</div>
			{/if}

			{#if detail.about}
				<div class="mb-5">
					<h3 class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Sobre</h3>
					<div class="max-h-40 overflow-y-auto text-[11px] leading-relaxed text-text-muted">
						{detail.about}
					</div>
				</div>
			{/if}

			{#if detail.skills.length > 0}
				<div class="mb-4">
					<h3 class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Skills</h3>
					<div class="flex flex-wrap gap-1.5">
						{#each detail.skills as skill (skill)}
							<span class="rounded-sm bg-surface-overlay px-1.5 py-0.5 text-[10px] text-text-muted">{skill}</span>
						{/each}
					</div>
				</div>
			{/if}

			{#if detail.preferences.length > 0}
				<div class="mb-4">
					<h3 class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Preferências</h3>
					<div class="flex flex-wrap gap-1.5">
						{#each detail.preferences as pref (pref)}
							<span class="rounded-sm bg-surface-overlay px-1.5 py-0.5 text-[10px] text-text-muted">{pref}</span>
						{/each}
					</div>
				</div>
			{/if}

			{#if detail.questions.length > 0}
				<div>
					<h3 class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Q&A</h3>
					<div class="space-y-2">
						{#each detail.questions as q (q.label)}
							<div class="rounded-md bg-surface-overlay px-3 py-2">
								<p class="text-[10px] text-text-faint">{q.label}</p>
								<p class="mt-0.5 text-[11px] text-text-secondary">{q.answer ?? '—'}</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}

		{:else}
			<!-- Aba Ações -->
			{#if job.status === 'FOUND'}
				<p class="mb-3 text-[12px] text-text-muted">Abra o formulário de candidatura para extrair as perguntas.</p>
				<p class="text-[11px] text-text-faint">Isso abrirá um browser e pode levar alguns segundos.</p>

			{:else if job.status === 'NEEDS_INPUT'}
				{#if unanswered.length > 0}
					<div class="mb-5 space-y-3">
						{#each unanswered as q (q.label)}
							<label class="block">
								<span class="mb-1 block text-[11px] font-medium text-text-secondary">{q.label}</span>
								{#if q.options.length > 0}
									<select
										class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
										bind:value={answerInputs[q.label]}
									>
										<option value="">Selecione…</option>
										{#each q.options as opt (opt)}
											<option value={opt}>{opt}</option>
										{/each}
									</select>
								{:else}
									<input
										type={q.fieldType ?? 'text'}
										class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
										bind:value={answerInputs[q.label]}
									/>
								{/if}
							</label>
						{/each}
					</div>
				{/if}

				{#if answered.length > 0}
					<div>
						<h3 class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Já respondidas</h3>
						<div class="space-y-1.5">
							{#each answered as q (q.label)}
								<div class="rounded-md bg-surface-overlay px-3 py-2">
									<p class="text-[10px] text-text-faint">{q.label}</p>
									<p class="mt-0.5 text-[11px] text-text-secondary">{q.answer}</p>
								</div>
							{/each}
						</div>
					</div>
				{/if}

			{:else if job.status === 'READY_FOR_REVIEW'}
				{#if detail.questions.length > 0}
					<div class="mb-5 space-y-3">
						{#each detail.questions as q (q.label)}
							<label class="block">
								<span class="mb-1 block text-[11px] font-medium text-text-secondary">{q.label}</span>
								{#if q.options.length > 0}
									<select
										class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
										bind:value={answerInputs[q.label]}
									>
										<option value="">Selecione…</option>
										{#each q.options as opt (opt)}
											<option value={opt}>{opt}</option>
										{/each}
									</select>
								{:else}
									<input
										type={q.fieldType ?? 'text'}
										class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
										bind:value={answerInputs[q.label]}
									/>
								{/if}
							</label>
						{/each}
					</div>
				{/if}

				{#if appState.resumes.length > 0}
					<div>
						<label class="mb-1 block text-[11px] font-medium text-text-secondary" for="resume-select">
							Currículo
						</label>
						<select
							id="resume-select"
							class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
							bind:value={selectedResume}
						>
							<option value="">Padrão{appState.defaultResume ? ` (${appState.defaultResume})` : ''}</option>
							{#each appState.resumes as r (r)}
								<option value={r}>{r}</option>
							{/each}
						</select>
					</div>
				{/if}

			{:else if job.status === 'EXTERNAL'}
				{#if detail.applicationUrl}
					<a
						href={detail.applicationUrl}
						target="_blank"
						rel="noreferrer noopener"
						class="flex items-center gap-1.5 text-[12px] text-[#a855f7] hover:underline"
					>
						<ExternalLink size={12} aria-hidden="true" />
						Candidatar externamente
					</a>
				{:else}
					<p class="text-[12px] text-text-faint">Nenhum link externo disponível.</p>
				{/if}

			{:else if job.status === 'FAILED'}
				{#if detail.errorMessage}
					<div class="mb-3 rounded-md bg-[#1c0a0a] px-3 py-2 text-[11px] text-[#ef4444]">
						{detail.errorMessage}
					</div>
				{/if}
				<p class="text-[12px] text-text-muted">Esta candidatura falhou. Você pode ignorá-la.</p>

			{:else}
				<p class="text-[12px] text-text-faint">Nenhuma ação disponível.</p>
			{/if}
		{/if}
	</div>

	<!-- Rodapé -->
	{#if hasActions && detail}
		<div class="flex flex-shrink-0 items-center justify-between gap-3 border-t border-border-subtle px-4 py-3">
			<span class="text-[11px] text-text-faint">{notice}</span>
			<div class="flex gap-2">
				{#if ['FOUND', 'NEEDS_INPUT', 'READY_FOR_REVIEW', 'FAILED'].includes(job.status)}
					<button
						type="button"
						class="h-8 rounded-md border border-border-default bg-surface-overlay px-3 text-[12px] font-medium text-text-muted hover:border-border-strong hover:text-text-secondary focus-visible:outline-none disabled:opacity-40"
						disabled={busy}
						onclick={handleSkip}
					>
						Ignorar
					</button>
				{/if}

				{#if job.status === 'FOUND'}
					<button
						type="button"
						class="h-8 rounded-md bg-accent-500 px-3 text-[12px] font-medium text-white hover:bg-accent-600 focus-visible:outline-none disabled:opacity-40"
						disabled={busy}
						onclick={handleGetQuestions}
					>
						{busy ? 'Abrindo…' : 'Abrir formulário'}
					</button>
				{:else if job.status === 'NEEDS_INPUT'}
					<button
						type="button"
						class="h-8 rounded-md bg-accent-500 px-3 text-[12px] font-medium text-white hover:bg-accent-600 focus-visible:outline-none disabled:opacity-40"
						disabled={busy || !canSave}
						onclick={handleSaveAnswers}
					>
						Salvar respostas
					</button>
				{:else if job.status === 'READY_FOR_REVIEW'}
					<button
						type="button"
						class="h-8 rounded-md bg-accent-500 px-3 text-[12px] font-medium text-white hover:bg-accent-600 focus-visible:outline-none disabled:opacity-40"
						disabled={busy}
						onclick={handleApply}
					>
						{busy ? 'Enviando…' : 'Enviar candidatura'}
					</button>
				{/if}
			</div>
		</div>
	{/if}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/lib/components/JobDrawer.svelte
git commit -m "feat: add JobDrawer component with slide animation"
```

---

## Task 7: JobTable

**Files:**
- Create: `src/lib/components/JobTable.svelte`

- [ ] **Step 1: Criar `src/lib/components/JobTable.svelte`**

```svelte
<script lang="ts">
	import StatusBadge from './StatusBadge.svelte';
	import type { ApplicationStatus, JobSummary, KanbanTab } from '$lib/types';

	interface Props {
		jobs: JobSummary[];
		onOpenJob: (job: JobSummary, tab: KanbanTab) => void;
	}

	let { jobs, onOpenJob }: Props = $props();

	let statusFilter = $state<ApplicationStatus | ''>('');
	let search = $state('');
	let selected = $state<Set<number>>(new Set());

	const statusLabels: Record<ApplicationStatus, string> = {
		FOUND: 'Encontrada', NEEDS_INPUT: 'Precisa Resposta', READY_FOR_REVIEW: 'Revisar',
		EXTERNAL: 'Externa', SUBMITTED: 'Enviada', SKIPPED: 'Ignorada', FAILED: 'Falhou'
	};

	const filtered = $derived(
		jobs.filter((j) => {
			if (statusFilter && j.status !== statusFilter) return false;
			if (search.trim()) {
				const q = search.toLowerCase();
				return (
					j.title.toLowerCase().includes(q) ||
					j.company.toLowerCase().includes(q) ||
					j.skills.some((s) => s.toLowerCase().includes(q))
				);
			}
			return true;
		})
	);

	function toggleSelect(id: number) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}

	function toggleAll() {
		if (selected.size === filtered.length) selected = new Set();
		else selected = new Set(filtered.map((j) => j.id));
	}

	function relativeDate(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const days = Math.floor(diff / 86_400_000);
		if (days === 0) return 'hoje';
		if (days === 1) return '1d';
		return `${days}d`;
	}

	const allStatuses: ApplicationStatus[] = [
		'FOUND', 'NEEDS_INPUT', 'READY_FOR_REVIEW', 'EXTERNAL', 'SUBMITTED', 'SKIPPED', 'FAILED'
	];

	const allSelected = $derived(filtered.length > 0 && selected.size === filtered.length);
</script>

<div class="flex h-full flex-col">
	<!-- Toolbar -->
	<div class="flex flex-shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-2.5">
		<select
			class="h-8 rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-muted focus:border-border-strong focus:outline-none"
			bind:value={statusFilter}
		>
			<option value="">Todos os status</option>
			{#each allStatuses as s (s)}
				<option value={s}>{statusLabels[s]}</option>
			{/each}
		</select>

		<input
			type="text"
			placeholder="Buscar vagas..."
			class="h-8 flex-1 rounded-md border border-border-subtle bg-surface-overlay px-2.5 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-default focus:outline-none"
			bind:value={search}
		/>

		<span class="text-[11px] text-text-faint">{filtered.length} vagas</span>
	</div>

	<!-- Tabela -->
	<div class="flex-1 overflow-auto">
		<table class="w-full border-collapse text-[12px]">
			<thead class="sticky top-0 bg-surface-base">
				<tr class="border-b border-border-subtle">
					<th class="w-9 px-3 py-2.5 text-left">
						<button
							type="button"
							class="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-border-default {allSelected ? 'bg-accent-500 border-accent-500' : 'bg-transparent'} focus-visible:outline-none"
							onclick={toggleAll}
							aria-label="Selecionar todos"
						>
							{#if allSelected}
								<span class="text-[8px] text-white">✓</span>
							{/if}
						</button>
					</th>
					<th class="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-text-faint">Vaga</th>
					<th class="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-text-faint">Empresa</th>
					<th class="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-text-faint">Local</th>
					<th class="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-text-faint">Status</th>
					<th class="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wide text-text-faint">Data</th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as job (job.id)}
					<tr
						class="cursor-pointer border-b border-border-subtle/40 hover:bg-surface-raised"
						onclick={() => onOpenJob(job, 'info')}
					>
						<td class="px-3 py-2.5" onclick={(e) => { e.stopPropagation(); toggleSelect(job.id); }}>
							<button
								type="button"
								class="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-border-default {selected.has(job.id) ? 'bg-accent-500 border-accent-500' : 'bg-transparent'} focus-visible:outline-none"
								aria-label="Selecionar vaga"
							>
								{#if selected.has(job.id)}
									<span class="text-[8px] text-white">✓</span>
								{/if}
							</button>
						</td>
						<td class="px-3 py-2.5">
							<p class="font-medium text-text-primary">{job.title}</p>
							{#if job.skills.length > 0}
								<div class="mt-0.5 flex flex-wrap gap-1">
									{#each job.skills.slice(0, 4) as skill (skill)}
										<span class="rounded-sm bg-surface-hover px-1 py-0.5 text-[10px] text-text-faint">{skill}</span>
									{/each}
									{#if job.skills.length > 4}
										<span class="text-[10px] text-text-faint">+{job.skills.length - 4}</span>
									{/if}
								</div>
							{/if}
						</td>
						<td class="px-3 py-2.5 text-text-muted">{job.company}</td>
						<td class="px-3 py-2.5 text-text-muted">{job.location || '—'}</td>
						<td class="px-3 py-2.5"><StatusBadge status={job.status} size="sm" /></td>
						<td class="px-3 py-2.5 text-text-faint">{relativeDate(job.createdAt)}</td>
					</tr>
				{/each}

				{#if filtered.length === 0}
					<tr>
						<td colspan="6" class="py-16 text-center text-[12px] text-text-faint">
							Nenhuma vaga encontrada
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/lib/components/JobTable.svelte
git commit -m "feat: add JobTable with filters and checkbox selection"
```

---

## Task 8: DiscoveryModal

**Files:**
- Create: `src/lib/components/DiscoveryModal.svelte`

- [ ] **Step 1: Criar `src/lib/components/DiscoveryModal.svelte`**

```svelte
<script lang="ts">
	import { fly } from 'svelte/transition';
	import X from '@lucide/svelte/icons/x';
	import * as api from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';
	import type { DiscoverConfig } from '$lib/types';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let keywords = $state(appState.discoverConfig.keywords ?? '');
	let location = $state(appState.discoverConfig.location ?? '');
	let maxJobs = $state(appState.discoverConfig.maxJobs?.toString() ?? '');
	let workType = $state(appState.discoverConfig.workType ?? '');
	let datePosted = $state(appState.discoverConfig.datePosted ?? '');
	let experienceLevel = $state<string[]>([...(appState.discoverConfig.experienceLevel ?? [])]);
	let jobType = $state<string[]>([...(appState.discoverConfig.jobType ?? [])]);
	let easyApply = $state((appState.discoverConfig.options?.easyApply as boolean) ?? true);
	let busy = $state(false);

	const WORK_TYPES = [
		{ value: '', label: 'Qualquer' },
		{ value: 'remote', label: 'Remoto' },
		{ value: 'hybrid', label: 'Híbrido' },
		{ value: 'onsite', label: 'Presencial' }
	];

	const DATE_POSTED = [
		{ value: '', label: 'Qualquer período' },
		{ value: 'day', label: 'Últimas 24h' },
		{ value: 'week', label: 'Última semana' },
		{ value: 'month', label: 'Último mês' }
	];

	const EXP_LEVELS = [
		{ value: 'entry', label: 'Júnior' },
		{ value: 'associate', label: 'Associate' },
		{ value: 'mid_senior', label: 'Pleno/Sênior' },
		{ value: 'director', label: 'Diretor' },
		{ value: 'executive', label: 'Executivo' }
	];

	const JOB_TYPES = [
		{ value: 'full_time', label: 'CLT' },
		{ value: 'part_time', label: 'Part-time' },
		{ value: 'contract', label: 'PJ/Contrato' },
		{ value: 'temporary', label: 'Temporário' },
		{ value: 'internship', label: 'Estágio' }
	];

	function toggle(arr: string[], val: string): string[] {
		return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	async function handleStart() {
		if (busy) return;
		busy = true;
		try {
			const config: DiscoverConfig = {
				provider: 'linkedin',
				keywords: keywords.trim() || undefined,
				location: location.trim() || undefined,
				workType: workType || undefined,
				datePosted: datePosted || undefined,
				experienceLevel: experienceLevel.length ? experienceLevel : undefined,
				jobType: jobType.length ? jobType : undefined,
				maxJobs: maxJobs ? parseInt(maxJobs, 10) : undefined,
				options: { easyApply }
			};
			const discovery = await api.startDiscovery(config);
			appState.discoverConfig = config;
			appState.activeDiscovery = discovery;
			appState.discoveries = [discovery, ...appState.discoveries];
			appState.startPolling(discovery.id);
			toastState.show('Descoberta iniciada');
			onClose();
		} catch {
			toastState.show('Falha ao iniciar descoberta');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Overlay -->
<div class="fixed inset-0 z-modal flex items-start justify-center bg-black/70 p-4">
	<button
		class="absolute inset-0 cursor-default"
		type="button"
		aria-label="Fechar"
		onclick={onClose}
	></button>

	<div
		class="relative z-10 mt-12 flex max-h-[calc(100vh-96px)] w-[min(480px,100%)] flex-col rounded-lg border border-border-default bg-surface-raised shadow-[var(--shadow-modal)]"
		role="dialog"
		aria-modal="true"
		aria-label="Nova descoberta"
		transition:fly={{ y: -12, duration: 180 }}
		onclick={(e) => e.stopPropagation()}
	>
		<!-- Header -->
		<div class="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-5 py-4">
			<div>
				<h2 class="text-[13px] font-semibold text-text-primary">Nova descoberta</h2>
				<p class="text-[11px] text-text-faint">LinkedIn · Easy Apply</p>
			</div>
			<button
				type="button"
				class="flex h-7 w-7 items-center justify-center rounded-md text-text-faint hover:bg-surface-overlay hover:text-text-muted focus-visible:outline-none"
				onclick={onClose}
				aria-label="Fechar"
			>
				<X size={14} />
			</button>
		</div>

		<!-- Body -->
		<div class="flex-1 space-y-4 overflow-y-auto p-5">
			<!-- Keywords -->
			<div>
				<label class="mb-1.5 block text-[11px] font-medium text-text-secondary" for="d-keywords">
					Palavras-chave
				</label>
				<textarea
					id="d-keywords"
					class="min-h-[64px] w-full resize-none rounded-md border border-border-default bg-surface-overlay px-3 py-2 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
					placeholder="Software Engineer&#10;Desenvolvedor Python"
					bind:value={keywords}
				></textarea>
				<p class="mt-1 text-[10px] text-text-faint">Uma palavra-chave por linha</p>
			</div>

			<!-- Local + Máx -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="mb-1.5 block text-[11px] font-medium text-text-secondary" for="d-location">Local</label>
					<input
						id="d-location"
						type="text"
						class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
						placeholder="Brasil"
						bind:value={location}
					/>
				</div>
				<div>
					<label class="mb-1.5 block text-[11px] font-medium text-text-secondary" for="d-max">Máx. vagas</label>
					<input
						id="d-max"
						type="number"
						min="1"
						class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
						placeholder="Ilimitado"
						bind:value={maxJobs}
					/>
				</div>
			</div>

			<!-- Tipo de trabalho + Data -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="mb-1.5 block text-[11px] font-medium text-text-secondary" for="d-work-type">Modelo</label>
					<select
						id="d-work-type"
						class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
						bind:value={workType}
					>
						{#each WORK_TYPES as opt (opt.value)}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
				<div>
					<label class="mb-1.5 block text-[11px] font-medium text-text-secondary" for="d-date">Publicado</label>
					<select
						id="d-date"
						class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
						bind:value={datePosted}
					>
						{#each DATE_POSTED as opt (opt.value)}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
			</div>

			<!-- Nível de experiência -->
			<div>
				<p class="mb-2 text-[11px] font-medium text-text-secondary">Nível</p>
				<div class="flex flex-wrap gap-x-4 gap-y-2">
					{#each EXP_LEVELS as level (level.value)}
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								class="accent-accent-500"
								checked={experienceLevel.includes(level.value)}
								onchange={() => { experienceLevel = toggle(experienceLevel, level.value); }}
							/>
							<span class="text-[12px] text-text-muted">{level.label}</span>
						</label>
					{/each}
				</div>
			</div>

			<!-- Tipo de contrato -->
			<div>
				<p class="mb-2 text-[11px] font-medium text-text-secondary">Tipo de contrato</p>
				<div class="flex flex-wrap gap-x-4 gap-y-2">
					{#each JOB_TYPES as jtype (jtype.value)}
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								class="accent-accent-500"
								checked={jobType.includes(jtype.value)}
								onchange={() => { jobType = toggle(jobType, jtype.value); }}
							/>
							<span class="text-[12px] text-text-muted">{jtype.label}</span>
						</label>
					{/each}
				</div>
			</div>

			<!-- Easy Apply -->
			<label class="flex cursor-pointer items-center justify-between gap-4">
				<div>
					<span class="text-[12px] font-medium text-text-secondary">Somente Easy Apply</span>
					<p class="text-[10px] text-text-faint">Apenas vagas com candidatura simplificada</p>
				</div>
				<input type="checkbox" class="accent-accent-500" bind:checked={easyApply} />
			</label>
		</div>

		<!-- Footer -->
		<div class="flex flex-shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-3.5">
			<button
				type="button"
				class="h-8 rounded-md border border-border-default bg-surface-overlay px-3.5 text-[12px] font-medium text-text-muted hover:border-border-strong hover:text-text-secondary focus-visible:outline-none"
				onclick={onClose}
			>
				Cancelar
			</button>
			<button
				type="button"
				class="h-8 rounded-md bg-accent-500 px-3.5 text-[12px] font-medium text-white hover:bg-accent-600 focus-visible:outline-none disabled:opacity-40"
				disabled={busy}
				onclick={handleStart}
			>
				{busy ? 'Iniciando…' : 'Iniciar descoberta'}
			</button>
		</div>
	</div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/lib/components/DiscoveryModal.svelte
git commit -m "feat: add DiscoveryModal (pt-BR)"
```

---

## Task 9: DiscoveriesView

**Files:**
- Create: `src/lib/components/DiscoveriesView.svelte`

- [ ] **Step 1: Criar `src/lib/components/DiscoveriesView.svelte`**

```svelte
<script lang="ts">
	import { cancelDiscovery } from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';
	import type { DiscoveryJob } from '$lib/types';

	interface Props {
		onStartNew: () => void;
	}

	let { onStartNew }: Props = $props();

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
	}

	function formatDuration(start: string, end: string | null): string {
		if (!end) return '';
		const ms = new Date(end).getTime() - new Date(start).getTime();
		const s = Math.floor(ms / 1000);
		const m = Math.floor(s / 60);
		return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
	}

	function configSummary(d: DiscoveryJob): string {
		const parts: string[] = [];
		const cfg = d.config;
		if (cfg.keywords) parts.push(cfg.keywords.split('\n').join(', '));
		if (cfg.location) parts.push(cfg.location);
		if (cfg.workType) {
			const map: Record<string, string> = { remote: 'Remoto', hybrid: 'Híbrido', onsite: 'Presencial' };
			parts.push(map[cfg.workType] ?? cfg.workType);
		}
		if (cfg.options?.easyApply) parts.push('Easy Apply');
		return parts.join(' · ') || 'LinkedIn';
	}

	async function handleCancel(d: DiscoveryJob) {
		try {
			await cancelDiscovery(d.id);
			appState.stopPolling();
			appState.activeDiscovery = null;
			appState.discoveries = appState.discoveries.map((x) =>
				x.id === d.id ? { ...x, status: 'cancelled' } : x
			);
			toastState.show('Descoberta cancelada');
		} catch {
			toastState.show('Falha ao cancelar');
		}
	}

	function handleRepeat(d: DiscoveryJob) {
		appState.discoverConfig = { ...d.config };
		onStartNew();
	}

	const statusLabel: Record<DiscoveryJob['status'], string> = {
		running: 'Em andamento',
		done: 'Concluída',
		failed: 'Falhou',
		cancelled: 'Cancelada'
	};

	const statusClass: Record<DiscoveryJob['status'], string> = {
		running: 'bg-[#2d2508] text-[#ca8a04]',
		done: 'bg-[#052e16] text-[#22c55e]',
		failed: 'bg-[#1c0a0a] text-[#ef4444]',
		cancelled: 'bg-[#1c1c20] text-[#52525b]'
	};
</script>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-4 py-3">
		<div>
			<h2 class="text-[13px] font-semibold text-text-primary">Discoveries</h2>
			<p class="text-[11px] text-text-faint">{appState.discoveries.length} buscas realizadas</p>
		</div>
		<button
			type="button"
			class="h-8 rounded-md bg-accent-500 px-3 text-[12px] font-medium text-white hover:bg-accent-600 focus-visible:outline-none"
			onclick={onStartNew}
		>
			Nova busca
		</button>
	</div>

	<!-- Lista -->
	<div class="flex-1 overflow-y-auto p-4">
		{#if appState.discoveries.length === 0}
			<div class="py-16 text-center text-[12px] text-text-faint">
				Nenhuma descoberta realizada ainda.
			</div>
		{:else}
			<div class="space-y-2">
				{#each appState.discoveries as d (d.id)}
					<div
						class="rounded-lg border bg-surface-raised px-4 py-3
							{d.status === 'running' ? 'border-[#2a2208]' : d.status === 'failed' ? 'border-[#2a1010]' : 'border-border-subtle'}"
					>
						<div class="mb-2 flex items-center justify-between gap-3">
							<div class="flex items-center gap-2">
								<span class="rounded-sm bg-[#1e3a5f] px-1.5 py-0.5 text-[10px] font-semibold text-[#3b82f6]">LinkedIn</span>
								<span class="rounded-sm px-1.5 py-0.5 text-[10px] font-medium {statusClass[d.status]}">
									{#if d.status === 'running'}
										<span class="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#ca8a04]"></span>
									{/if}
									{statusLabel[d.status]}
								</span>
							</div>

							<div class="flex items-center gap-2">
								{#if d.status === 'running'}
									<span class="text-[11px] text-text-faint">{d.discovered} encontradas</span>
									<button
										type="button"
										class="h-6 rounded-md border border-border-default bg-surface-overlay px-2.5 text-[11px] text-text-muted hover:border-border-strong focus-visible:outline-none"
										onclick={() => handleCancel(d)}
									>
										Cancelar
									</button>
								{:else}
									<span class="text-[12px] font-semibold text-text-secondary">{d.discovered} vagas</span>
									<button
										type="button"
										class="h-6 rounded-md border border-border-default bg-surface-overlay px-2.5 text-[11px] text-text-muted hover:border-border-strong focus-visible:outline-none"
										onclick={() => handleRepeat(d)}
									>
										Repetir
									</button>
								{/if}
							</div>
						</div>

						<p class="text-[11px] text-text-muted">{configSummary(d)}</p>

						<div class="mt-1 flex items-center gap-3 text-[10px] text-text-faint">
							{#if d.status === 'failed' && d.errorMessage}
								<span class="text-[#ef4444]">{d.errorMessage}</span>
							{/if}
							<span>{formatDate(d.startedAt)}</span>
							{#if d.finishedAt}
								<span>· {formatDuration(d.startedAt, d.finishedAt)}</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/lib/components/DiscoveriesView.svelte
git commit -m "feat: add DiscoveriesView with history and repeat"
```

---

## Task 10: SettingsView

**Files:**
- Create: `src/lib/components/SettingsView.svelte`

- [ ] **Step 1: Criar `src/lib/components/SettingsView.svelte`**

```svelte
<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import FileText from '@lucide/svelte/icons/file-text';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';
	import * as api from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';

	async function handleSetting(patch: Partial<typeof appState.settings>) {
		try {
			appState.settings = await api.updateAppSettings(patch);
		} catch {
			toastState.show('Falha ao salvar configuração');
		}
	}

	async function handleUpload(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const { filename } = await api.uploadResume(file);
			if (!appState.resumes.includes(filename)) appState.resumes = [...appState.resumes, filename];
			if (appState.resumes.length === 1) {
				await api.setDefaultResume(filename);
				appState.defaultResume = filename;
			}
			toastState.show(`Upload realizado: ${filename}`);
		} catch {
			toastState.show('Falha no upload');
		}
		(e.target as HTMLInputElement).value = '';
	}

	async function handleSetDefault(filename: string) {
		try {
			await api.setDefaultResume(filename);
			appState.defaultResume = filename;
			toastState.show('Currículo padrão atualizado');
		} catch {
			toastState.show('Falha ao definir padrão');
		}
	}

	async function handleDelete(filename: string) {
		try {
			await api.deleteResume(filename);
			appState.resumes = appState.resumes.filter((r) => r !== filename);
			if (appState.defaultResume === filename) appState.defaultResume = null;
			toastState.show(`${filename} removido`);
		} catch {
			toastState.show('Falha ao remover currículo');
		}
	}

	let clearConfirming = $state(false);

	async function handleClearDatabase() {
		if (!clearConfirming) { clearConfirming = true; return; }
		try {
			await api.clearDatabase();
			appState.jobs = [];
			clearConfirming = false;
			toastState.show('Banco de dados limpo');
		} catch {
			clearConfirming = false;
			toastState.show('Falha ao limpar banco de dados');
		}
	}
</script>

<div class="mx-auto max-w-xl p-6">
	<h2 class="mb-6 text-[15px] font-semibold text-text-primary">Configurações</h2>

	<!-- Automação -->
	<section class="mb-6">
		<h3 class="mb-3 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Automação</h3>
		<button
			type="button"
			class="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-left hover:border-border-default focus-visible:outline-none"
			onclick={() => handleSetting({ browserVisible: !appState.settings.browserVisible })}
		>
			<div class="flex items-center gap-3">
				{#if appState.settings.browserVisible}
					<Eye size={15} strokeWidth={1.75} class="text-accent-500 flex-shrink-0" aria-hidden="true" />
				{:else}
					<EyeOff size={15} strokeWidth={1.75} class="text-text-faint flex-shrink-0" aria-hidden="true" />
				{/if}
				<div>
					<p class="text-[12px] font-medium text-text-primary">Mostrar browser durante automação</p>
					<p class="text-[11px] text-text-faint">
						{appState.settings.browserVisible ? 'Janela visível' : 'Browser roda em background'}
					</p>
				</div>
			</div>
			<div
				class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150
					{appState.settings.browserVisible ? 'bg-accent-500' : 'bg-surface-overlay border border-border-default'}"
			>
				<span
					class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150
						{appState.settings.browserVisible ? 'left-[18px]' : 'left-[3px]'}"
				></span>
			</div>
		</button>
	</section>

	<!-- Idioma de busca -->
	<section class="mb-6">
		<h3 class="mb-1 text-[12px] font-medium text-text-primary">Idioma de busca</h3>
		<p class="mb-3 text-[11px] text-text-faint">Afeta quais vagas o LinkedIn retorna para suas palavras-chave</p>
		<div class="flex rounded-lg border border-border-default overflow-hidden">
			{#each [{ value: 'pt-BR', label: 'Português (BR)' }, { value: 'en-US', label: 'English (US)' }] as opt (opt.value)}
				<button
					type="button"
					class="flex-1 px-3 py-2 text-[12px] font-medium transition-colors duration-100 focus-visible:outline-none
						{appState.settings.searchLocale === opt.value
							? 'bg-accent-500 text-white'
							: 'bg-surface-overlay text-text-muted hover:bg-surface-hover'}"
					onclick={() => handleSetting({ searchLocale: opt.value as 'pt-BR' | 'en-US' })}
				>
					{opt.label}
				</button>
			{/each}
		</div>
	</section>

	<!-- Currículos -->
	<section class="mb-6">
		<div class="mb-3 flex items-center justify-between">
			<h3 class="text-[10px] font-semibold uppercase tracking-wide text-text-faint">
				Currículos {#if appState.resumes.length > 0}<span class="normal-case font-normal">({appState.resumes.length})</span>{/if}
			</h3>
			<label class="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border-default bg-surface-overlay px-2.5 text-[11px] font-medium text-text-muted hover:border-border-strong hover:text-text-secondary">
				<Upload size={11} aria-hidden="true" />
				Upload PDF
				<input type="file" class="sr-only" accept=".pdf" onchange={handleUpload} />
			</label>
		</div>

		{#if appState.resumes.length === 0}
			<div class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-subtle py-10 text-center">
				<FileText size={24} strokeWidth={1.5} class="text-text-faint" aria-hidden="true" />
				<p class="text-[11px] text-text-faint">Nenhum currículo enviado</p>
			</div>
		{:else}
			<div class="space-y-1.5">
				{#each appState.resumes as filename (filename)}
					<div class="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised px-3 py-2.5">
						<FileText size={13} strokeWidth={1.75} class="flex-shrink-0 text-text-faint" aria-hidden="true" />
						<span class="min-w-0 flex-1 truncate text-[12px] text-text-primary">{filename}</span>
						<div class="flex flex-shrink-0 items-center gap-3">
							{#if appState.defaultResume === filename}
								<span class="text-[10px] font-bold text-[#22c55e]">PADRÃO</span>
							{:else}
								<button
									type="button"
									class="text-[10px] font-medium text-text-faint hover:text-text-muted focus-visible:outline-none"
									onclick={() => handleSetDefault(filename)}
								>
									Definir padrão
								</button>
							{/if}
							<button
								type="button"
								class="text-[10px] font-medium text-[#ef4444] hover:text-[#dc2626] focus-visible:outline-none"
								onclick={() => handleDelete(filename)}
							>
								Remover
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Zona de perigo -->
	<section>
		<h3 class="mb-3 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Zona de perigo</h3>
		<div class="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3">
			<div>
				<p class="text-[12px] font-medium text-text-primary">Limpar todos os dados</p>
				<p class="text-[11px] text-text-faint">Remove todas as vagas, candidaturas e descobertas. Currículos são mantidos.</p>
			</div>
			<button
				type="button"
				class="h-8 flex-shrink-0 rounded-md border px-3 text-[12px] font-medium focus-visible:outline-none transition-colors
					{clearConfirming
						? 'border-[#ef4444] bg-[#1c0a0a] text-[#ef4444] hover:bg-[#2a0f0f]'
						: 'border-border-default bg-surface-overlay text-[#ef4444] hover:border-[#ef4444]'}"
				onclick={handleClearDatabase}
			>
				<Trash2 size={13} class="mr-1.5 inline-block" aria-hidden="true" />
				{clearConfirming ? 'Confirmar?' : 'Limpar'}
			</button>
		</div>
	</section>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/lib/components/SettingsView.svelte
git commit -m "feat: add SettingsView (pt-BR)"
```

---

## Task 11: +page.svelte — Roteador principal

**Files:**
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Reescrever `src/routes/+page.svelte`**

Substituir TODO o conteúdo por:

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import KanbanBoard from '$lib/components/kanban/KanbanBoard.svelte';
	import JobTable from '$lib/components/JobTable.svelte';
	import JobDrawer from '$lib/components/JobDrawer.svelte';
	import DiscoveriesView from '$lib/components/DiscoveriesView.svelte';
	import SettingsView from '$lib/components/SettingsView.svelte';
	import DiscoveryModal from '$lib/components/DiscoveryModal.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { appState } from '$lib/state.svelte';
	import { cancelDiscovery, startAutoApply, stopAutoApply } from '$lib/api';
	import { toastState } from '$lib/toast.svelte';
	import type { JobSummary, KanbanTab, Page } from '$lib/types';

	let activePage = $state<Page>('pipeline');
	let selectedJob = $state<{ job: JobSummary; tab: KanbanTab } | null>(null);
	let discoveryModalOpen = $state(false);

	onMount(() => appState.init());

	const isDiscovering = $derived(appState.activeDiscovery?.status === 'running');
	const discoveredCount = $derived(appState.activeDiscovery?.discovered ?? 0);

	function openJob(job: JobSummary, tab: KanbanTab) {
		selectedJob = { job, tab };
	}

	async function handleToggleAutoApply() {
		if (appState.autoApply.running) {
			try {
				await stopAutoApply();
				appState.autoApply = { ...appState.autoApply, running: false };
				appState.stopAutoApplyPolling();
				toastState.show('Auto-apply parado');
			} catch {
				toastState.show('Falha ao parar auto-apply');
			}
		} else {
			try {
				await startAutoApply();
				appState.autoApply = { running: true, applied: 0, failed: 0 };
				appState.startAutoApplyPolling();
				toastState.show('Auto-apply iniciado');
			} catch {
				toastState.show('Falha ao iniciar auto-apply');
			}
		}
	}

	async function handleStopDiscovery() {
		if (!appState.activeDiscovery) return;
		try {
			await cancelDiscovery(appState.activeDiscovery.id);
			appState.stopPolling();
			appState.activeDiscovery = null;
			toastState.show('Descoberta cancelada');
		} catch {
			toastState.show('Falha ao cancelar descoberta');
		}
	}

	const pageTitles: Record<Page, string> = {
		pipeline: 'Pipeline',
		tabela: 'Tabela',
		discoveries: 'Discoveries',
		configuracoes: 'Configurações'
	};

	const actionCounts = $derived({
		total: appState.jobs.length,
		needsAction: appState.jobs.filter((j) =>
			['NEEDS_INPUT', 'READY_FOR_REVIEW', 'EXTERNAL'].includes(j.status)
		).length
	});
</script>

<svelte:head>
	<title>EZJobApplier</title>
</svelte:head>

<div class="flex h-screen overflow-hidden bg-surface-base font-sans text-text-primary">
	<!-- Sidebar -->
	<Sidebar
		{activePage}
		autoApply={appState.autoApply}
		{isDiscovering}
		{discoveredCount}
		onNavigate={(p) => { activePage = p; }}
		onStartDiscovery={() => { discoveryModalOpen = true; }}
		onToggleAutoApply={handleToggleAutoApply}
		onStopDiscovery={handleStopDiscovery}
	/>

	<!-- Área principal -->
	<div class="flex flex-1 flex-col overflow-hidden">
		<!-- Header da página -->
		{#if activePage !== 'configuracoes' && activePage !== 'discoveries'}
			<header class="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3.5">
				<h1 class="text-[14px] font-semibold text-text-primary">{pageTitles[activePage]}</h1>
				<p class="text-[11px] text-text-faint">
					{actionCounts.total} vagas
					{#if actionCounts.needsAction > 0}
						· <span class="text-[#ca8a04]">{actionCounts.needsAction} precisam de ação</span>
					{/if}
				</p>
			</header>
		{/if}

		<!-- Conteúdo -->
		<main class="relative flex-1 overflow-hidden">
			{#if activePage === 'pipeline'}
				<KanbanBoard jobs={appState.jobs} onOpenJob={openJob} />
			{:else if activePage === 'tabela'}
				<JobTable jobs={appState.jobs} onOpenJob={openJob} />
			{:else if activePage === 'discoveries'}
				<DiscoveriesView onStartNew={() => { discoveryModalOpen = true; }} />
			{:else if activePage === 'configuracoes'}
				<SettingsView />
			{/if}

			<!-- Drawer (por cima do conteúdo) -->
			{#if selectedJob}
				<JobDrawer
					job={selectedJob.job}
					initialTab={selectedJob.tab}
					onClose={() => { selectedJob = null; }}
				/>
			{/if}
		</main>
	</div>
</div>

<!-- Modal de nova descoberta -->
{#if discoveryModalOpen}
	<DiscoveryModal onClose={() => { discoveryModalOpen = false; }} />
{/if}

<Toast />
```

- [ ] **Step 2: Verificar tipos**

```bash
cd apps/frontend && pnpm check
```

Esperado: 0 erros de TypeScript.

- [ ] **Step 3: Iniciar servidor de dev e verificar visualmente**

```bash
cd apps/frontend && pnpm dev
```

Abrir http://localhost:5173 e verificar:
- [ ] Sidebar aparece com 4 itens de navegação
- [ ] Pipeline mostra kanban (pode estar vazio se backend não estiver rodando)
- [ ] Navegação entre Pipeline / Tabela / Discoveries / Configurações funciona
- [ ] Botão "Nova descoberta" abre modal
- [ ] Modal fecha com Esc e botão Cancelar
- [ ] Configurações mostra toggle de browser e seção de currículos
- [ ] Toast aparece nas interações

- [ ] **Step 4: Commit final**

```bash
git add apps/frontend/src/routes/+page.svelte
git commit -m "feat: complete frontend redesign — dark/minimal, sidebar, drawer, pt-BR"
```

---

## Notas de Implementação

**Tailwind v4:** Classes customizadas como `bg-surface-base`, `text-text-primary`, `border-border-subtle` são geradas automaticamente a partir dos tokens `--color-*` definidos em `layout.css`. Tokens `--color-accent-500` viram `bg-accent-500`, `text-accent-500`, etc.

**Svelte 5 runes:** Usar `$state()`, `$derived()`, `$props()` — nunca `let` reativo sem `$state`. `$effect()` só quando necessário.

**Animações:** O `transition:fly` no JobDrawer requer que o elemento seja condicional com `{#if}` — nunca use `display:none`.

**Lucide imports:** Sempre importar individualmente: `import Search from '@lucide/svelte/icons/search'`.

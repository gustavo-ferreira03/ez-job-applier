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

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
			headerClass: 'text-status-input-text'
		},
		{
			id: 'review',
			title: 'Na fila',
			statuses: ['READY_FOR_REVIEW'],
			defaultTab: 'actions' as KanbanTab,
			headerClass: 'text-execution-text'
		},
		{
			id: 'external',
			title: 'Externa',
			statuses: ['EXTERNAL'],
			defaultTab: 'actions' as KanbanTab,
			headerClass: 'text-status-external-text'
		},
		{
			id: 'submitted',
			title: 'Enviadas',
			statuses: ['SUBMITTED'],
			defaultTab: 'info' as KanbanTab,
			headerClass: 'text-status-submitted-text'
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

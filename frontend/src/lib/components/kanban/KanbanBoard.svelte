<script lang="ts">
	import KanbanColumn from './KanbanColumn.svelte';
	import type { JobSummary, KanbanColumn as KanbanColumnDef, KanbanTab } from '$lib/types';

	interface Props {
		jobs: JobSummary[];
		processingIds?: Set<number>;
		onOpenJob?: (jobId: string, defaultTab: KanbanTab) => void;
	}

	let { jobs, processingIds = new Set<number>(), onOpenJob = () => undefined }: Props = $props();

	const columns: KanbanColumnDef[] = [
		{ id: 'found', title: 'Found', statuses: ['FOUND'] },
		{
			id: 'needs-input',
			title: 'Needs Input',
			statuses: ['NEEDS_INPUT'],
			alert: 'yellow',
			defaultTab: 'actions'
		},
		{
			id: 'review',
			title: 'Review',
			statuses: ['READY_FOR_REVIEW'],
			alert: 'blue',
			defaultTab: 'actions'
		},
		{
			id: 'external',
			title: 'External',
			statuses: ['EXTERNAL'],
			alert: 'purple',
			defaultTab: 'actions'
		},
		{ id: 'submitted', title: 'Submitted', statuses: ['SUBMITTED'] },
		{ id: 'done', title: 'Rejected', statuses: ['REJECTED', 'SKIPPED', 'FAILED'], muted: true }
	];

	function jobsForColumn(column: KanbanColumnDef) {
		return jobs.filter((job) => column.statuses.includes(job.status));
	}
</script>

<section class="kanban" aria-label="Application kanban board">
	{#each columns as column (column.id)}
		<KanbanColumn
			{column}
			jobs={jobsForColumn(column)}
			{processingIds}
			{onOpenJob}
		/>
	{/each}
</section>

<style>
	.kanban {
		display: flex;
		min-height: calc(100vh - 72px);
		gap: 16px;
		overflow-x: auto;
		overflow-y: hidden;
		padding: 16px;
	}

	@media (max-width: 760px) {
		.kanban {
			min-height: auto;
			flex-direction: column;
			overflow: visible;
			padding: 16px;
		}
	}
</style>

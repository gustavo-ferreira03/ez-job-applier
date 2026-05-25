<script lang="ts">
	import KanbanCard from './KanbanCard.svelte';
	import type { JobSummary, KanbanColumn as KanbanColumnDef, KanbanTab } from '$lib/types';

	interface Props {
		column: KanbanColumnDef;
		jobs: JobSummary[];
		processingIds: Set<number>;
		onOpenJob: (jobId: string, defaultTab: KanbanTab) => void;
	}

	let { column, jobs, processingIds, onOpenJob }: Props = $props();

	function isProcessing(job: JobSummary): boolean {
		return (
			job.application_id !== null &&
			processingIds.has(job.application_id) &&
			job.status !== 'FOUND'
		);
	}

	const cls = $derived(
		[
			'column',
			column.muted ? 'is-muted' : '',
			column.alert && jobs.length > 0 ? `alert-${column.alert}` : ''
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

<article class={cls} aria-labelledby={`column-${column.id}`}>
	<header class="column-header">
		<h2 id={`column-${column.id}`}>{column.title}</h2>
		<span class="count" aria-label={`${jobs.length} jobs`}>{jobs.length}</span>
	</header>

	<div class="column-body">
		{#if jobs.length}
			{#each jobs as job (job.job_id)}
				<KanbanCard
					{job}
					processing={isProcessing(job)}
					onOpen={() => onOpenJob(job.job_id, column.defaultTab ?? 'info')}
				/>
			{/each}
		{:else}
			<p class="empty">Empty</p>
		{/if}
	</div>
</article>

<style>
	.column {
		display: flex;
		flex: 0 0 272px;
		max-height: calc(100vh - 104px);
		flex-direction: column;
		overflow: hidden;
		border: 1px solid #172c46;
		background: #0b1829;
	}

	.column.is-muted {
		opacity: 0.55;
	}

	.column.alert-yellow {
		border-color: rgb(245 158 11 / 0.45);
	}

	.column.alert-blue {
		border-color: rgb(56 189 248 / 0.45);
	}

	.column.alert-purple {
		border-color: rgb(167 139 250 / 0.45);
	}

	.column-header {
		display: flex;
		min-height: 44px;
		align-items: center;
		gap: 8px;
		border-bottom: 1px solid #172c46;
		background: #091522;
		padding: 0 14px;
	}

	.column-header h2 {
		margin: 0;
		color: #4a6a88;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		line-height: 1;
		text-transform: uppercase;
	}

	.count {
		margin-left: auto;
		background: #0f1e34;
		color: #3d5878;
		font-size: 11px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 20px;
		min-width: 24px;
		padding: 0 6px;
		text-align: center;
	}

	.alert-yellow .column-header h2 {
		color: #8a6a28;
	}

	.alert-yellow .count {
		color: #8a6020;
	}

	.alert-blue .column-header h2 {
		color: #2e6a8a;
	}

	.alert-blue .count {
		color: #276280;
	}

	.alert-purple .column-header h2 {
		color: #6248a8;
	}

	.alert-purple .count {
		color: #5840a0;
	}

	.column-body {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 6px;
		overflow-y: auto;
		padding: 8px;
	}

	.empty {
		margin: 0;
		padding: 20px 16px;
		color: #1e3450;
		font-size: 12px;
		text-align: center;
		border: 1px dashed #172c46;
	}

	@media (max-width: 760px) {
		.column {
			max-height: none;
			flex-basis: auto;
			width: 100%;
		}
	}
</style>

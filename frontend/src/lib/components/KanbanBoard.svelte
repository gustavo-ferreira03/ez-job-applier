<script lang="ts">
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import type { JobSummary, KanbanColumn, KanbanTab } from '$lib/types';

	interface Props {
		jobs: JobSummary[];
		processingIds?: Set<number>;
		onOpenJob?: (jobId: string, defaultTab: KanbanTab) => void;
	}

	let { jobs, processingIds = new Set<number>(), onOpenJob = () => undefined }: Props = $props();

	const columns: KanbanColumn[] = [
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

	function jobsForColumn(column: KanbanColumn) {
		return jobs.filter((job) => column.statuses.includes(job.status));
	}

	function formatTime(iso: string | null) {
		if (!iso) return '';
		return new Date(`${iso}Z`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	function isProcessing(job: JobSummary) {
		return job.application_id !== null && processingIds.has(job.application_id) && job.status !== 'FOUND';
	}

	function columnClass(column: KanbanColumn, count: number) {
		const classes = ['column'];
		if (column.muted) classes.push('is-muted');
		if (column.alert && count > 0) classes.push(`alert-${column.alert}`);
		return classes.join(' ');
	}

	function cardClass(job: JobSummary) {
		const classes = ['job-card'];
		if (isProcessing(job)) classes.push('is-processing');
		else if (job.status === 'NEEDS_INPUT') classes.push('accent-warn');
		else if (job.status === 'READY_FOR_REVIEW') classes.push('accent-info');
		else if (job.status === 'EXTERNAL') classes.push('accent-purple');
		else if (job.status === 'FAILED') classes.push('accent-danger');
		return classes.join(' ');
	}

	function statusHint(job: JobSummary) {
		if (job.status === 'NEEDS_INPUT' && job.unanswered_count > 0) {
			return `${job.unanswered_count} unanswered`;
		}
		if (job.status === 'FAILED' && job.error_message) {
			return job.error_message;
		}
		return '';
	}

	function hintClass(job: JobSummary) {
		if (job.status === 'FAILED') return 'hint danger';
		if (job.status === 'NEEDS_INPUT') return 'hint warn';
		return 'hint';
	}
</script>

<section class="kanban" aria-label="Application kanban board">
	{#each columns as column (column.id)}
		{@const columnJobs = jobsForColumn(column)}
		<article class={columnClass(column, columnJobs.length)} aria-labelledby={`column-${column.id}`}>
			<header class="column-header">
				<h2 id={`column-${column.id}`}>{column.title}</h2>
				<span class="count" aria-label={`${columnJobs.length} jobs`}>{columnJobs.length}</span>
			</header>

			<div class="column-body">
				{#if columnJobs.length}
					{#each columnJobs as job (job.job_id)}
						<button
							type="button"
							class={cardClass(job)}
							onclick={() => onOpenJob(job.job_id, column.defaultTab ?? 'info')}
							aria-label={`Open ${job.title ?? 'Untitled job'}`}
						>
							<span class="job-title">{job.title ?? 'Untitled job'}</span>
							<span class="job-meta">
								{job.company ?? 'Unknown company'}{job.location ? ` · ${job.location}` : ''}
							</span>
							<span class="job-foot">
								<span class="job-time">{formatTime(job.application_updated_at ?? job.updated_at)}</span>
								{#if isProcessing(job)}
									<span class="spinner" aria-label="Processing">
										<LoaderCircle size={16} strokeWidth={2.25} aria-hidden="true" />
									</span>
								{:else if statusHint(job)}
									<span class={hintClass(job)} title={statusHint(job)}>{statusHint(job)}</span>
								{/if}
							</span>
						</button>
					{/each}
				{:else}
					<p class="empty">No items.</p>
				{/if}
			</div>
		</article>
	{/each}
</section>

<style>
	.kanban {
		display: flex;
		min-height: 100vh;
		gap: 16px;
		overflow-x: auto;
		overflow-y: hidden;
		padding: 16px;
	}

	.column {
		display: flex;
		flex: 0 0 288px;
		max-height: calc(100vh - 32px);
		flex-direction: column;
		overflow: hidden;
		border: 1px solid #1e2d45;
		background: #111827;
	}

	.column.is-muted {
		opacity: 0.68;
	}

	.column.alert-yellow {
		border-color: rgb(251 191 36 / 0.5);
	}

	.column.alert-blue {
		border-color: rgb(56 189 248 / 0.5);
	}

	.column.alert-purple {
		border-color: rgb(167 139 250 / 0.5);
	}

	.column-header {
		display: flex;
		min-height: 48px;
		align-items: center;
		gap: 8px;
		border-bottom: 1px solid #1e2d45;
		padding: 0 16px;
	}

	.column-header h2 {
		margin: 0;
		color: #94a3b8;
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.08em;
		line-height: 1;
		text-transform: uppercase;
	}

	.count {
		margin-left: auto;
		border: 1px solid #334155;
		background: #1e293b;
		color: #cbd5e1;
		font-size: 12px;
		font-weight: 800;
		line-height: 22px;
		min-width: 32px;
		padding: 0 8px;
		text-align: center;
	}

	.column-body {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 8px;
		overflow-y: auto;
		padding: 8px;
	}

	.job-card {
		display: flex;
		min-height: 104px;
		width: 100%;
		cursor: pointer;
		flex-direction: column;
		border: 1px solid #1e2d45;
		border-left-width: 4px;
		border-left-color: transparent;
		background: #0c1120;
		padding: 12px;
		color: #f1f5f9;
		font: inherit;
		text-align: left;
	}

	.job-card:hover,
	.job-card:focus-visible {
		border-color: #334155;
		background: #1e293b;
		outline: 0;
	}

	.job-card:focus-visible {
		box-shadow: inset 0 0 0 2px #38bdf8;
	}

	.job-card.accent-warn {
		border-left-color: #fbbf24;
	}

	.job-card.accent-info {
		border-left-color: #38bdf8;
	}

	.job-card.accent-purple {
		border-left-color: #a78bfa;
	}

	.job-card.accent-danger {
		border-left-color: #f87171;
	}

	.job-card.is-processing {
		border-color: #38bdf8;
	}

	.job-title {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		font-size: 14px;
		font-weight: 800;
		line-height: 1.3;
	}

	.job-meta {
		overflow: hidden;
		margin-top: 8px;
		color: #94a3b8;
		font-size: 12px;
		line-height: 1.4;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.job-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-top: auto;
		padding-top: 16px;
	}

	.job-time {
		color: #64748b;
		font-size: 12px;
	}

	.hint {
		overflow: hidden;
		max-width: 144px;
		font-size: 12px;
		font-weight: 800;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hint.warn {
		color: #fbbf24;
	}

	.hint.danger {
		color: #f87171;
	}

	.spinner {
		display: inline-flex;
		height: 24px;
		width: 24px;
		align-items: center;
		justify-content: center;
		animation: spin 0.8s linear infinite;
		color: #38bdf8;
	}

	.empty {
		margin: 0;
		border: 1px dashed #334155;
		padding: 16px;
		color: #64748b;
		font-size: 13px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 760px) {
		.kanban {
			min-height: auto;
			flex-direction: column;
			overflow: visible;
			padding: 16px;
		}

		.column {
			max-height: none;
			flex-basis: auto;
			width: 100%;
		}
	}
</style>

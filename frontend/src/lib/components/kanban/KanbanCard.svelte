<script lang="ts">
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import type { JobSummary } from '$lib/types';

	interface Props {
		job: JobSummary;
		processing: boolean;
		onOpen: () => void;
	}

	let { job, processing, onOpen }: Props = $props();

	const cls = $derived(
		[
			'job-card',
			processing
				? 'is-processing'
				: job.status === 'NEEDS_INPUT'
					? 'accent-warn'
					: job.status === 'READY_FOR_REVIEW'
						? 'accent-info'
						: job.status === 'EXTERNAL'
							? 'accent-purple'
							: job.status === 'FAILED'
								? 'accent-danger'
								: ''
		]
			.filter(Boolean)
			.join(' ')
	);

	const hint = $derived(
		job.status === 'NEEDS_INPUT' && job.unanswered_count > 0
			? `${job.unanswered_count} unanswered`
			: job.status === 'FAILED' && job.error_message
				? job.error_message
				: ''
	);

	const hintCls = $derived(
		job.status === 'FAILED' ? 'hint danger' : job.status === 'NEEDS_INPUT' ? 'hint warn' : 'hint'
	);

	const time = $derived(
		(() => {
			const iso = job.application_updated_at ?? job.updated_at;
			if (!iso) return '';
			return new Date(`${iso}Z`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		})()
	);
</script>

<button
	type="button"
	class={cls}
	onclick={onOpen}
	aria-label={`Open ${job.title ?? 'Untitled job'}`}
>
	<span class="job-title">{job.title ?? 'Untitled job'}</span>
	<span class="job-meta">
		<span class="job-company">{job.company ?? 'Unknown company'}</span>
		{#if job.location}
			<span class="job-location"> · {job.location}</span>
		{/if}
	</span>
	<span class="job-foot">
		<span class="job-time">{time}</span>
		{#if processing}
			<span class="spinner" aria-label="Processing">
				<LoaderCircle size={14} strokeWidth={2.5} aria-hidden="true" />
			</span>
		{:else if hint}
			<span class={hintCls} title={hint}>{hint}</span>
		{/if}
	</span>
</button>

<style>
	.job-card {
		display: flex;
		width: 100%;
		cursor: pointer;
		flex-direction: column;
		border: 1px solid #1a2e48;
		border-left: 3px solid transparent;
		background: #0f1e34;
		padding: 14px 14px 12px;
		color: #dce8f5;
		font: inherit;
		text-align: left;
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.35);
		transition: background 0.1s, box-shadow 0.1s;
	}

	.job-card:hover,
	.job-card:focus-visible {
		background: #152440;
		border-color: #26405f;
		border-left-color: transparent;
		outline: 0;
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.5);
	}

	.job-card:focus-visible {
		box-shadow:
			0 2px 8px rgb(0 0 0 / 0.5),
			inset 0 0 0 1px #38bdf8;
	}

	.job-card.accent-warn {
		border-left-color: #f59e0b;
	}

	.job-card.accent-warn:hover,
	.job-card.accent-warn:focus-visible {
		border-left-color: #f59e0b;
	}

	.job-card.accent-info {
		border-left-color: #38bdf8;
	}

	.job-card.accent-info:hover,
	.job-card.accent-info:focus-visible {
		border-left-color: #38bdf8;
	}

	.job-card.accent-purple {
		border-left-color: #a78bfa;
	}

	.job-card.accent-purple:hover,
	.job-card.accent-purple:focus-visible {
		border-left-color: #a78bfa;
	}

	.job-card.accent-danger {
		border-left-color: #f87171;
	}

	.job-card.accent-danger:hover,
	.job-card.accent-danger:focus-visible {
		border-left-color: #f87171;
	}

	.job-card.is-processing {
		border-color: rgb(56 189 248 / 0.4);
		border-left-color: #38bdf8;
	}

	.job-card.is-processing:hover,
	.job-card.is-processing:focus-visible {
		border-color: rgb(56 189 248 / 0.6);
		border-left-color: #38bdf8;
	}

	.job-title {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		font-size: 13px;
		font-weight: 700;
		line-height: 1.4;
		color: #e2eefa;
	}

	.job-meta {
		display: block;
		overflow: hidden;
		margin-top: 6px;
		font-size: 12px;
		line-height: 1.4;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.job-company {
		color: #7a9ab8;
	}

	.job-location {
		color: #3d5878;
	}

	.job-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-top: 12px;
		padding-top: 10px;
		border-top: 1px solid #172c46;
	}

	.job-time {
		color: #2f4d68;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
	}

	.hint {
		overflow: hidden;
		max-width: 136px;
		font-size: 11px;
		font-weight: 700;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hint.warn {
		color: #f59e0b;
	}

	.hint.danger {
		color: #f87171;
	}

	.spinner {
		display: inline-flex;
		height: 20px;
		width: 20px;
		align-items: center;
		justify-content: center;
		animation: spin 0.9s linear infinite;
		color: #38bdf8;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>

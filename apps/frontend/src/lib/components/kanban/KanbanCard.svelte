<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cardTransition } from '$lib/transitions';
	import type { JobSummary, KanbanTab } from '$lib/types';

	interface Props {
		job: JobSummary;
		defaultTab: KanbanTab;
		onOpen: (job: JobSummary, tab: KanbanTab) => void;
	}

	let { job, defaultTab, onOpen }: Props = $props();

	const loading = $derived(job.processing && job.about === null);

	function relativeDate(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const days = Math.floor(diff / 86_400_000);
		if (days === 0) return 'today';
		if (days === 1) return '1d';
		return `${days}d`;
	}
</script>

{#if loading}
<div
	class="w-full rounded-md border border-border-subtle bg-surface-raised p-2.5"
	transition:fly={cardTransition}
	aria-label="Loading job"
>
	<div class="animate-pulse">
		<div class="h-3.5 w-full rounded bg-border-strong"></div>
		<div class="mt-2 h-3 w-1/2 rounded bg-border-strong"></div>
		<div class="mt-3 flex gap-1.5">
			<div class="h-4 w-10 rounded-sm bg-border-strong"></div>
			<div class="h-4 w-12 rounded-sm bg-border-strong"></div>
			<div class="h-4 w-8 rounded-sm bg-border-strong"></div>
		</div>
	</div>
</div>
{:else}
<button
	type="button"
	class="w-full cursor-pointer rounded-md bg-surface-raised p-2.5 text-left focus-visible:outline-none
		{job.processing
		? 'animate-pulse-border border-2 border-accent-500'
		: 'border border-border-subtle transition-colors duration-100 hover:border-border-default'}"
	onclick={() => onOpen(job, defaultTab)}
	transition:fly={cardTransition}
>
	<!-- Title -->
	<div class="flex items-center justify-between gap-2">
		<p class="min-w-0 truncate text-sm font-medium text-text-primary">{job.title}</p>
		{#if job.processing}
			<svg
				class="h-3.5 w-3.5 shrink-0 animate-spin text-accent-500"
				viewBox="0 0 24 24"
				fill="none"
			>
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
				<path
					class="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
				/>
			</svg>
		{/if}
	</div>

	<!-- Company · Location -->
	<p class="mt-0.5 truncate text-[13px] text-text-muted">
		{job.company}
		{#if job.location}<span class="text-text-muted opacity-75"> · {job.location}</span>{/if}
	</p>

	<!-- Skills -->
	{#if job.skills.length > 0}
		<div class="mt-2 flex flex-wrap gap-1">
			{#each job.skills.slice(0, 3) as skill (skill)}
				<span class="rounded-sm bg-surface-hover px-1.5 py-0.5 text-xs text-text-muted"
					>{skill}</span
				>
			{/each}
			{#if job.skills.length > 3}
				<span class="rounded-sm bg-surface-hover px-1.5 py-0.5 text-xs text-text-muted"
					>+{job.skills.length - 3}</span
				>
			{/if}
		</div>
	{/if}

	<div class="mt-2 flex items-center justify-between border-t border-border-subtle pt-1.5">
		<div class="flex items-center gap-1.5">
			{#if job.unansweredCount > 0}
				<span
					class="rounded-sm bg-status-unanswered-bg px-1.5 py-0.5 text-xs font-medium text-status-unanswered-text"
				>
					{job.unansweredCount} unanswered
				</span>
			{:else if job.status === 'APPROVED'}
				<span
					class="rounded-sm bg-execution-bg px-1.5 py-0.5 text-xs font-medium text-execution-text"
				>
					Queued
				</span>
			{/if}
		</div>
		<span class="text-xs text-text-muted">{relativeDate(job.createdAt)}</span>
	</div>
</button>
{/if}

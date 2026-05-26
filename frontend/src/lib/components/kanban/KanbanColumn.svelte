<script lang="ts">
	import KanbanCard from './KanbanCard.svelte';
	import type { JobSummary, KanbanColumn as KanbanColumnDef, KanbanTab } from '$lib/types';

	interface Props {
		column: KanbanColumnDef;
		jobs: JobSummary[];
		processingIds: Set<number>;
		onOpenJob: (job: JobSummary, defaultTab: KanbanTab) => void;
	}

	let { column, jobs, processingIds, onOpenJob }: Props = $props();

	function isProcessing(job: JobSummary): boolean {
		return (
			job.application_id !== null && processingIds.has(job.application_id) && job.status !== 'FOUND'
		);
	}

	const cls = $derived(
		[
			'flex max-h-[calc(100vh-104px)] flex-[0_0_272px] flex-col overflow-hidden rounded-[var(--radius-card)] border border-border-subtle bg-surface-raised max-[760px]:max-h-none max-[760px]:w-full max-[760px]:basis-auto',
			column.muted ? 'opacity-55' : '',
			column.alert === 'yellow' && jobs.length > 0 ? 'border-warn-500/45' : '',
			column.alert === 'blue' && jobs.length > 0 ? 'border-brand-500/45' : '',
			column.alert === 'purple' && jobs.length > 0 ? 'border-purple-500/45' : ''
		]
			.filter(Boolean)
			.join(' ')
	);

	const headingCls = $derived(
		[
			'm-0 text-[11px] leading-none font-bold tracking-[0.1em] text-[#4a6a88] uppercase',
			column.alert === 'yellow' && jobs.length > 0 ? 'text-[#8a6a28]' : '',
			column.alert === 'blue' && jobs.length > 0 ? 'text-[#2e6a8a]' : '',
			column.alert === 'purple' && jobs.length > 0 ? 'text-[#6248a8]' : ''
		]
			.filter(Boolean)
			.join(' ')
	);

	const countCls = $derived(
		[
			'ml-auto min-w-6 rounded-[6px] bg-surface-overlay px-[6px] text-center text-[11px] leading-5 font-bold text-text-muted tabular-nums',
			column.alert === 'yellow' && jobs.length > 0 ? 'text-[#8a6020]' : '',
			column.alert === 'blue' && jobs.length > 0 ? 'text-[#276280]' : '',
			column.alert === 'purple' && jobs.length > 0 ? 'text-[#5840a0]' : ''
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

<article class={cls} aria-labelledby={`column-${column.id}`}>
	<header
		class="flex min-h-11 items-center gap-2 border-b border-border-subtle bg-[#091522] px-[14px]"
	>
		<h2 id={`column-${column.id}`} class={headingCls}>{column.title}</h2>
		<span class={countCls} aria-label={`${jobs.length} jobs`}>{jobs.length}</span>
	</header>

	<div class="flex flex-1 flex-col gap-[6px] overflow-y-auto p-2">
		{#if jobs.length}
			{#each jobs as job (job.job_id)}
				<KanbanCard
					{job}
					processing={isProcessing(job)}
					onOpen={() => onOpenJob(job, column.defaultTab ?? 'info')}
				/>
			{/each}
		{:else}
			<p
				class="m-0 rounded-[var(--radius-card)] border border-dashed border-border-subtle px-4 py-5 text-center text-xs text-[#1e3450]"
			>
				Empty
			</p>
		{/if}
	</div>
</article>

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

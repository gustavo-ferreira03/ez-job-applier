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

<div class="flex h-full w-[260px] flex-shrink-0 flex-col">
	<!-- Cabeçalho -->
	<div class="mb-2 flex flex-shrink-0 items-center justify-between px-0.5">
		<span class="text-xs font-semibold uppercase tracking-wide {column.headerClass}">
			{column.title}
		</span>
		<span class="text-xs text-text-muted">{jobs.length}</span>
	</div>

	<!-- Cards (scroll independente) -->
	<div class="flex flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
		{#each jobs as job (job.id)}
			<KanbanCard {job} defaultTab={column.defaultTab} onOpen={onOpenJob} />
		{/each}

		{#if jobs.length === 0}
			<div class="rounded-md border border-dashed border-border-subtle py-6 text-center text-xs text-text-muted">
				Vazio
			</div>
		{/if}
	</div>
</div>

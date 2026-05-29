<script lang="ts">
	import type { JobSummary, KanbanTab } from '$lib/types';

	interface Props {
		job: JobSummary;
		defaultTab: KanbanTab;
		onOpen: (job: JobSummary, tab: KanbanTab) => void;
	}

	let { job, defaultTab, onOpen }: Props = $props();

	function relativeDate(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const days = Math.floor(diff / 86_400_000);
		if (days === 0) return 'hoje';
		if (days === 1) return '1d';
		return `${days}d`;
	}
</script>

<button
	type="button"
	class="w-full rounded-md border border-border-subtle bg-surface-raised p-2.5 text-left transition-colors duration-100 hover:border-border-default focus-visible:outline-none"
	onclick={() => onOpen(job, defaultTab)}
>
	<!-- Título -->
	<p class="truncate text-[12px] font-medium text-text-primary">{job.title}</p>

	<!-- Empresa · Local -->
	<p class="mt-0.5 truncate text-[11px] text-text-faint">
		{job.company}
		{#if job.location}<span class="text-text-faint opacity-60"> · {job.location}</span>{/if}
	</p>

	<!-- Skills -->
	{#if job.skills.length > 0}
		<div class="mt-2 flex flex-wrap gap-1">
			{#each job.skills.slice(0, 3) as skill (skill)}
				<span class="rounded-sm bg-surface-hover px-1.5 py-0.5 text-[10px] text-text-faint">{skill}</span>
			{/each}
			{#if job.skills.length > 3}
				<span class="rounded-sm bg-surface-hover px-1.5 py-0.5 text-[10px] text-text-faint">+{job.skills.length - 3}</span>
			{/if}
		</div>
	{/if}

	<!-- Rodapé -->
	<div class="mt-2 flex items-center justify-between border-t border-border-subtle pt-1.5">
		<div class="flex items-center gap-1.5">
			{#if job.unansweredCount > 0}
				<span class="rounded-sm bg-[#431407] px-1.5 py-0.5 text-[10px] font-medium text-[#f97316]">
					{job.unansweredCount} sem resp.
				</span>
			{:else if job.status === 'READY_FOR_REVIEW'}
				<span class="rounded-sm bg-[#1e3a5f] px-1.5 py-0.5 text-[10px] font-medium text-[#3b82f6]">
					Pronto p/ enviar
				</span>
			{/if}
		</div>
		<span class="text-[10px] text-text-faint">{relativeDate(job.createdAt)}</span>
	</div>
</button>

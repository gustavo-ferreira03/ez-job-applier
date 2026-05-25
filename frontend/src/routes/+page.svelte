<script lang="ts">
	import AppHeader from '$lib/components/AppHeader.svelte';
	import JobActionsModal from '$lib/components/JobActionsModal.svelte';
	import KanbanBoard from '$lib/components/kanban/KanbanBoard.svelte';
	import { mockJobs } from '$lib/mockJobs';
	import type { KanbanTab } from '$lib/types';

	let selectedJob = $state<{ jobId: string; defaultTab: KanbanTab } | null>(null);
	const processingIds = new Set<number>([1003]);

	function openMockJob(jobId: string, defaultTab: KanbanTab) {
		selectedJob = { jobId, defaultTab };
	}

	function closeModal() {
		selectedJob = null;
	}
</script>

<svelte:head>
	<title>EZJobApplier Kanban</title>
</svelte:head>

<main class="min-h-screen bg-surface-base font-sans text-text-primary">
	<AppHeader />

	<KanbanBoard jobs={mockJobs} {processingIds} onOpenJob={openMockJob} />

	{#if selectedJob}
		<JobActionsModal onClose={closeModal} />
	{/if}
</main>

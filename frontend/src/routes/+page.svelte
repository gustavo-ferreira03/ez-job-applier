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

<main class="page-shell">
	<AppHeader />

	<KanbanBoard jobs={mockJobs} {processingIds} onOpenJob={openMockJob} />

	{#if selectedJob}
		<JobActionsModal onClose={closeModal} />
	{/if}
</main>

<style>
	.page-shell {
		min-height: 100vh;
		background: #070d1a;
		color: #dce8f5;
		font-family:
			Instrument Sans,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

</style>

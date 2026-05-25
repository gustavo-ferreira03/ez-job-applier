<script lang="ts">
	import { onMount } from 'svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import JobActionsModal from '$lib/components/JobActionsModal.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import KanbanBoard from '$lib/components/kanban/KanbanBoard.svelte';
	import { appState } from '$lib/state.svelte';
	import type { JobSummary, KanbanTab } from '$lib/types';

	let settingsOpen = $state(false);
	let selectedJob = $state<{ job: JobSummary; defaultTab: KanbanTab } | null>(null);

	onMount(() => {
		appState.init();
		appState.connectSSE();
	});

	function openSettings() {
		settingsOpen = true;
	}

	function openJob(job: JobSummary, defaultTab: KanbanTab) {
		selectedJob = { job, defaultTab };
	}

	function closeModal() {
		selectedJob = null;
	}
</script>

<svelte:head>
	<title>EZJobApplier</title>
</svelte:head>

<main class="min-h-screen bg-surface-base font-sans text-text-primary">
	<AppHeader onOpenSettings={openSettings} />

	<KanbanBoard
		jobs={appState.jobs}
		processingIds={appState.processingIds}
		onOpenJob={openJob}
	/>

	{#if settingsOpen}
		<SettingsModal onClose={() => (settingsOpen = false)} />
	{/if}

	{#if selectedJob}
		<JobActionsModal
			job={selectedJob.job}
			defaultTab={selectedJob.defaultTab}
			onClose={closeModal}
		/>
	{/if}

	<Toast />
</main>

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
	});

	function openJob(job: JobSummary, defaultTab: KanbanTab) {
		selectedJob = { job, defaultTab };
	}
</script>

<svelte:head>
	<title>EZJobApplier</title>
</svelte:head>

<main class="min-h-screen bg-surface-base font-sans text-text-primary">
	<AppHeader onOpenSettings={() => (settingsOpen = true)} />

	<KanbanBoard jobs={appState.jobs} onOpenJob={openJob} />

	{#if settingsOpen}
		<SettingsModal onClose={() => (settingsOpen = false)} />
	{/if}

	{#if selectedJob}
		<JobActionsModal
			job={selectedJob.job}
			defaultTab={selectedJob.defaultTab}
			onClose={() => (selectedJob = null)}
		/>
	{/if}

	<Toast />
</main>

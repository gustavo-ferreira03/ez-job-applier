<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import KanbanBoard from '$lib/components/kanban/KanbanBoard.svelte';
	import JobTable from '$lib/components/JobTable.svelte';
	import JobModal from '$lib/components/JobModal.svelte';
	import DiscoveriesView from '$lib/components/DiscoveriesView.svelte';
	import SettingsView from '$lib/components/SettingsView.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { appState } from '$lib/state.svelte';
	import { startAutoApply, stopAutoApply, startExecution, stopExecution, pauseExecution, resumeExecution } from '$lib/api';
	import { toastState } from '$lib/toast.svelte';
	import type { JobSummary, KanbanTab, Page } from '$lib/types';

	let activePage = $state<Page>('pipeline');
	let selectedJob = $state<{ job: JobSummary; tab: KanbanTab } | null>(null);
	let loginModalOpen = $state(false);
	let wasActionNeeded = $state(false);

	onMount(() => appState.init());

	$effect(() => {
		const actionNeeded = appState.execution.actionNeeded;
		if (actionNeeded && !wasActionNeeded) loginModalOpen = true;
		if (!actionNeeded && wasActionNeeded) loginModalOpen = false;
		wasActionNeeded = actionNeeded;
	});

	function openJob(job: JobSummary, tab: KanbanTab) {
		selectedJob = { job, tab };
	}

	async function handleToggleAutoApply() {
		if (appState.autoApply.running) {
			try {
				await stopAutoApply();
				appState.autoApply = { ...appState.autoApply, running: false };
				appState.stopAutoApplyPolling();
				toastState.show('Auto-apply stopped', 'success');
			} catch {
				toastState.show('Failed to stop auto-apply', 'error');
			}
		} else {
			try {
				await startAutoApply();
				appState.autoApply = { running: true, applied: 0, failed: 0 };
				appState.startAutoApplyPolling();
				toastState.show('Auto-apply started', 'success');
			} catch {
				toastState.show('Failed to start auto-apply', 'error');
			}
		}
	}

	async function handleStartExecution() {
		const config = appState.settings.general.execution;
		if (!config.keywords?.trim() || !appState.settings.general.defaultResume) {
			activePage = 'configuracoes';
			toastState.show('Configure keywords and a default resume before starting', 'error');
			return;
		}

		try {
			await startExecution();
			appState.execution = { ...appState.execution, active: true, running: false, paused: false };
			appState.startExecutionPolling();
			toastState.show('Execution started', 'success');
		} catch {
			toastState.show('Failed to start execution', 'error');
		}
	}

	async function handleStopExecution() {
		try {
			await stopExecution();
			appState.execution = { ...appState.execution, active: false, running: false };
			appState.stopExecutionPolling();
			toastState.show('Execution stopped', 'success');
		} catch {
			toastState.show('Failed to stop execution', 'error');
		}
	}

	async function handlePauseExecution() {
		try {
			await pauseExecution();
			appState.execution = { ...appState.execution, paused: true };
			toastState.show('Execution paused', 'success');
		} catch {
			toastState.show('Failed to pause execution', 'error');
		}
	}

	async function handleResumeExecution() {
		try {
			await resumeExecution();
			appState.execution = { ...appState.execution, paused: false };
			toastState.show('Execution resumed', 'success');
		} catch {
			toastState.show('Failed to resume execution', 'error');
		}
	}


	const pageTitles: Record<Page, string> = {
		pipeline: 'Pipeline',
		tabela: 'Table',
		discoveries: 'History',
		configuracoes: 'Settings'
	};

	const actionCounts = $derived({
		total: appState.jobs.filter((j) =>
			['FOUND', 'NEEDS_INPUT', 'READY_FOR_REVIEW', 'EXTERNAL'].includes(j.status)
		).length,
		needsAction: appState.jobs.filter((j) =>
			['NEEDS_INPUT', 'READY_FOR_REVIEW', 'EXTERNAL'].includes(j.status)
		).length
	});
</script>

<svelte:head>
	<title>EZJobApplier</title>
</svelte:head>

<div class="flex h-screen overflow-hidden bg-surface-base font-sans text-text-primary">
	<Sidebar
		{activePage}
		execution={appState.execution}
		onNavigate={(p) => { activePage = p; }}
		onStartExecution={handleStartExecution}
		onStopExecution={handleStopExecution}
		onPauseExecution={handlePauseExecution}
		onResumeExecution={handleResumeExecution}
		onOpenLogin={() => { loginModalOpen = true; }}
	/>

	<div class="flex flex-1 flex-col overflow-hidden">
		{#if activePage !== 'configuracoes' && activePage !== 'discoveries'}
			<header class="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3.5">
				<h1 class="text-[14px] font-semibold text-text-primary">{pageTitles[activePage]}</h1>
				<p class="text-[11px] text-text-faint">
					{actionCounts.total} active jobs
					{#if actionCounts.needsAction > 0}
						· <span class="text-[#ca8a04]">{actionCounts.needsAction} need action</span>
					{/if}
				</p>
			</header>
		{/if}

		<main class="relative flex-1 overflow-hidden">
			{#key activePage}
				<div class="h-full" in:fade={{ duration: 120 }}>
					{#if activePage === 'pipeline'}
						<KanbanBoard jobs={appState.jobs} onOpenJob={openJob} />
					{:else if activePage === 'tabela'}
						<JobTable jobs={appState.jobs} onOpenJob={openJob} />
					{:else if activePage === 'discoveries'}
						<DiscoveriesView />
					{:else if activePage === 'configuracoes'}
						<SettingsView />
					{/if}
				</div>
			{/key}

			{#if selectedJob}
				<JobModal
					job={selectedJob.job}
					initialTab={selectedJob.tab}
					onClose={() => { selectedJob = null; }}
				/>
			{/if}
		</main>
	</div>
</div>

{#if loginModalOpen}
	<LoginModal onClose={() => { loginModalOpen = false; }} />
{/if}

<Toast />

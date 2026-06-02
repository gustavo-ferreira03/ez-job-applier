<script lang="ts">
	import { onMount } from 'svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import KanbanBoard from '$lib/components/kanban/KanbanBoard.svelte';
	import JobTable from '$lib/components/JobTable.svelte';
	import JobModal from '$lib/components/JobModal.svelte';
	import DiscoveriesView from '$lib/components/DiscoveriesView.svelte';
	import SettingsView from '$lib/components/SettingsView.svelte';
	import ExecutionModal from '$lib/components/ExecutionModal.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { appState } from '$lib/state.svelte';
	import { startAutoApply, stopAutoApply, startExecution, stopExecution, pauseExecution, resumeExecution } from '$lib/api';
	import { toastState } from '$lib/toast.svelte';
	import type { JobSummary, KanbanTab, Page } from '$lib/types';

	let activePage = $state<Page>('pipeline');
	let selectedJob = $state<{ job: JobSummary; tab: KanbanTab } | null>(null);
	let executionModalOpen = $state(false);
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
				toastState.show('Auto-apply parado');
			} catch {
				toastState.show('Falha ao parar auto-apply');
			}
		} else {
			try {
				await startAutoApply();
				appState.autoApply = { running: true, applied: 0, failed: 0 };
				appState.startAutoApplyPolling();
				toastState.show('Auto-apply iniciado');
			} catch {
				toastState.show('Falha ao iniciar auto-apply');
			}
		}
	}

	async function handleStartExecution() {
		executionModalOpen = true;
	}

	async function handleStopExecution() {
		try {
			await stopExecution();
			appState.execution = { ...appState.execution, active: false, running: false };
			appState.stopExecutionPolling();
			toastState.show('Execução parada');
		} catch {
			toastState.show('Falha ao parar execução');
		}
	}

	async function handlePauseExecution() {
		try {
			await pauseExecution();
			appState.execution = { ...appState.execution, paused: true };
			toastState.show('Execução pausada');
		} catch {
			toastState.show('Falha ao pausar execução');
		}
	}

	async function handleResumeExecution() {
		try {
			await resumeExecution();
			appState.execution = { ...appState.execution, paused: false };
			toastState.show('Execução retomada');
		} catch {
			toastState.show('Falha ao retomar execução');
		}
	}


	const pageTitles: Record<Page, string> = {
		pipeline: 'Pipeline',
		tabela: 'Tabela',
		discoveries: 'Histórico',
		configuracoes: 'Configurações'
	};

	const actionCounts = $derived({
		total: appState.jobs.length,
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
					{actionCounts.total} vagas
					{#if actionCounts.needsAction > 0}
						· <span class="text-[#ca8a04]">{actionCounts.needsAction} precisam de ação</span>
					{/if}
				</p>
			</header>
		{/if}

		<main class="relative flex-1 overflow-hidden">
			{#if activePage === 'pipeline'}
				<KanbanBoard jobs={appState.jobs} onOpenJob={openJob} />
			{:else if activePage === 'tabela'}
				<JobTable jobs={appState.jobs} onOpenJob={openJob} />
			{:else if activePage === 'discoveries'}
				<DiscoveriesView />
			{:else if activePage === 'configuracoes'}
				<SettingsView />
			{/if}

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

{#if executionModalOpen}
	<ExecutionModal onClose={() => { executionModalOpen = false; }} />
{/if}

{#if loginModalOpen}
	<LoginModal onClose={() => { loginModalOpen = false; }} />
{/if}

<Toast />

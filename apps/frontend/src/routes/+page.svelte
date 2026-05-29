<script lang="ts">
	import { onMount } from 'svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import KanbanBoard from '$lib/components/kanban/KanbanBoard.svelte';
	import JobTable from '$lib/components/JobTable.svelte';
	import JobDrawer from '$lib/components/JobDrawer.svelte';
	import DiscoveriesView from '$lib/components/DiscoveriesView.svelte';
	import SettingsView from '$lib/components/SettingsView.svelte';
	import DiscoveryModal from '$lib/components/DiscoveryModal.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { appState } from '$lib/state.svelte';
	import { cancelDiscovery, startAutoApply, stopAutoApply } from '$lib/api';
	import { toastState } from '$lib/toast.svelte';
	import type { JobSummary, KanbanTab, Page } from '$lib/types';

	let activePage = $state<Page>('pipeline');
	let selectedJob = $state<{ job: JobSummary; tab: KanbanTab } | null>(null);
	let discoveryModalOpen = $state(false);

	onMount(() => appState.init());

	const isDiscovering = $derived(appState.activeDiscovery?.status === 'running');
	const discoveredCount = $derived(appState.activeDiscovery?.discovered ?? 0);

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

	async function handleStopDiscovery() {
		if (!appState.activeDiscovery) return;
		try {
			await cancelDiscovery(appState.activeDiscovery.id);
			appState.stopPolling();
			appState.activeDiscovery = null;
			toastState.show('Descoberta cancelada');
		} catch {
			toastState.show('Falha ao cancelar descoberta');
		}
	}

	const pageTitles: Record<Page, string> = {
		pipeline: 'Pipeline',
		tabela: 'Tabela',
		discoveries: 'Discoveries',
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
	<!-- Sidebar -->
	<Sidebar
		{activePage}
		autoApply={appState.autoApply}
		{isDiscovering}
		{discoveredCount}
		onNavigate={(p) => { activePage = p; }}
		onStartDiscovery={() => { discoveryModalOpen = true; }}
		onToggleAutoApply={handleToggleAutoApply}
		onStopDiscovery={handleStopDiscovery}
	/>

	<!-- Área principal -->
	<div class="flex flex-1 flex-col overflow-hidden">
		<!-- Header da página -->
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

		<!-- Conteúdo -->
		<main class="relative flex-1 overflow-hidden">
			{#if activePage === 'pipeline'}
				<KanbanBoard jobs={appState.jobs} onOpenJob={openJob} />
			{:else if activePage === 'tabela'}
				<JobTable jobs={appState.jobs} onOpenJob={openJob} />
			{:else if activePage === 'discoveries'}
				<DiscoveriesView onStartNew={() => { discoveryModalOpen = true; }} />
			{:else if activePage === 'configuracoes'}
				<SettingsView />
			{/if}

			<!-- Drawer (por cima do conteúdo) -->
			{#if selectedJob}
				<JobDrawer
					job={selectedJob.job}
					initialTab={selectedJob.tab}
					onClose={() => { selectedJob = null; }}
				/>
			{/if}
		</main>
	</div>
</div>

<!-- Modal de nova descoberta -->
{#if discoveryModalOpen}
	<DiscoveryModal onClose={() => { discoveryModalOpen = false; }} />
{/if}

<Toast />

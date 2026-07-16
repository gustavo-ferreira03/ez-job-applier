<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import KanbanBoard from '$lib/components/kanban/KanbanBoard.svelte';
	import JobModal from '$lib/components/JobModal.svelte';
	import SettingsView from '$lib/components/SettingsView.svelte';
	import ChatView from '$lib/components/ChatView.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import ExternalApplyModal from '$lib/components/ExternalApplyModal.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { appState } from '$lib/state.svelte';
	import { startExecution, stopExecution, resumeExecution } from '$lib/api';
	import { toastState } from '$lib/toast.svelte';
	import type { JobSummary, KanbanTab, Page } from '$lib/types';

	let activePage = $state<Page>('pipeline');
	let selectedJob = $state<{ job: JobSummary; tab: KanbanTab } | null>(null);
	let loginModalOpen = $state(false);
	let browserModalOpen = $state(false);
	let wasActionNeeded = $state(false);
	let externalApplyJobId = $state<number | null>(null);

	onMount(() => appState.init());

	$effect(() => {
		const actionNeeded = appState.execution.actionNeeded;
		if (actionNeeded && !wasActionNeeded) loginModalOpen = true;
		if (!actionNeeded && wasActionNeeded) loginModalOpen = false;
		wasActionNeeded = actionNeeded;
	});

	$effect(() => {
		if (!appState.execution.running || !appState.execution.vncSessionId) browserModalOpen = false;
	});

	function openJob(job: JobSummary, tab: KanbanTab) {
		selectedJob = { job, tab };
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
		chat: 'Assistant',
		configuracoes: 'Settings'
	};

	const pageDescriptions: Record<Page, string> = {
		pipeline: 'Move each application through review, questions, submission, or rejection.',
		chat: 'Talk to the assistant; paste job links and ask it to tailor or apply.',
		configuracoes: 'Define the profile used by automatic execution.'
	};

	const actionCounts = $derived({
		total: appState.jobs.filter((j) =>
			['FOUND', 'NEEDS_INPUT', 'READY_FOR_REVIEW'].includes(j.status)
		).length,
		needsAction: appState.jobs.filter((j) =>
			['NEEDS_INPUT', 'READY_FOR_REVIEW'].includes(j.status)
		).length,
		review: appState.jobs.filter((j) => j.status === 'READY_FOR_REVIEW').length
	});
</script>

<svelte:head>
	<title>EZJobApplier</title>
</svelte:head>

<div
	class="flex h-dvh flex-col overflow-hidden bg-surface-base font-sans text-text-primary md:flex-row"
>
	<Sidebar
		{activePage}
		execution={appState.execution}
		onNavigate={(p) => {
			activePage = p;
		}}
		onStartExecution={handleStartExecution}
		onStopExecution={handleStopExecution}
		onResumeExecution={handleResumeExecution}
		onOpenLogin={() => {
			loginModalOpen = true;
		}}
		onOpenBrowser={() => {
			browserModalOpen = true;
		}}
	/>

	<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
		{#if activePage !== 'configuracoes' && activePage !== 'chat'}
			<header
				class="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-surface-base/95 px-4 py-3 md:px-5 md:py-4"
			>
				<div class="min-w-0">
					<h1 class="text-base leading-tight font-semibold text-text-primary">
						{pageTitles[activePage]}
					</h1>
					<p class="mt-0.5 max-w-[38rem] text-[12px] leading-snug text-text-faint">
						{pageDescriptions[activePage]}
					</p>
				</div>

				<div class="flex flex-wrap items-center gap-2 text-[11px]">
					<span
						class="rounded-full border border-border-default px-2.5 py-1 font-medium text-text-secondary"
					>
						{actionCounts.total} active jobs
					</span>
					{#if actionCounts.review > 0}
						<span
							class="rounded-full bg-status-review-bg px-2.5 py-1 font-medium text-status-review-text"
						>
							{actionCounts.review} for review
						</span>
					{/if}
					{#if actionCounts.needsAction > 0}
						<span
							class="rounded-full bg-status-input-bg px-2.5 py-1 font-medium text-status-input-text"
						>
							{actionCounts.needsAction} need action
						</span>
					{/if}
				</div>
			</header>
		{/if}

		<main class="relative min-h-0 flex-1 overflow-hidden">
			{#key activePage}
				<div class="h-full" in:fade={{ duration: 120 }}>
					{#if activePage === 'pipeline'}
						<KanbanBoard jobs={appState.jobs} onOpenJob={openJob} />
					{:else if activePage === 'chat'}
						<ChatView />
					{:else if activePage === 'configuracoes'}
						<SettingsView />
					{/if}
				</div>
			{/key}

			{#if selectedJob}
				<JobModal
					job={selectedJob.job}
					initialTab={selectedJob.tab}
					onOpenAgent={(jobId) => {
						externalApplyJobId = jobId;
					}}
					onClose={() => {
						selectedJob = null;
					}}
				/>
			{/if}
		</main>
	</div>
</div>

{#if loginModalOpen && appState.execution.vncSessionId}
	<LoginModal
		vncSessionId={appState.execution.vncSessionId}
		onClose={() => {
			loginModalOpen = false;
		}}
	/>
{/if}

{#if browserModalOpen && appState.execution.vncSessionId}
	<LoginModal
		vncSessionId={appState.execution.vncSessionId}
		title="LinkedIn browser"
		description="Live browser used for LinkedIn discovery and Easy Apply."
		onClose={() => {
			browserModalOpen = false;
		}}
	/>
{/if}

{#if externalApplyJobId !== null}
	<ExternalApplyModal
		jobId={externalApplyJobId}
		onClose={() => {
			externalApplyJobId = null;
		}}
	/>
{/if}

<Toast />

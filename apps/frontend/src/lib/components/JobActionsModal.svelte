<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import X from '@lucide/svelte/icons/x';
	import * as api from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';
	import type { JobDetail, JobSummary, KanbanTab } from '$lib/types';

	interface Props {
		job: JobSummary;
		defaultTab: KanbanTab;
		onClose: () => void;
	}

	let { job, defaultTab, onClose }: Props = $props();

	const _initialTab = untrack(() => defaultTab);
	const _initialResume = untrack(() => job.resumeFilename);

	let detail = $state<JobDetail | null>(null);
	let loadError = $state(false);
	let activeTab = $state<KanbanTab>(_initialTab);
	let busy = $state(false);
	let actionNotice = $state('');
	let answerInputs = $state<Record<string, string>>({});
	let selectedResume = $state(_initialResume ?? '');

	onMount(async () => {
		try {
			detail = await api.getJob(job.id);
			selectedResume = detail.resumeFilename ?? '';
		} catch {
			loadError = true;
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	const unanswered = $derived(detail?.questions.filter((q) => q.answer == null) ?? []);
	const answered = $derived(detail?.questions.filter((q) => q.answer != null) ?? []);
	const canSubmit = $derived(unanswered.every((q) => answerInputs[q.label]?.trim()));
	const hasActionFooter = $derived(
		['FOUND', 'NEEDS_INPUT', 'READY_FOR_REVIEW', 'EXTERNAL', 'FAILED'].includes(job.status)
	);

	async function handleSubmitAnswers() {
		if (busy) return;
		busy = true;
		actionNotice = 'Saving…';
		try {
			const answers: Record<string, string> = {};
			for (const q of unanswered) {
				if (answerInputs[q.label]?.trim()) answers[q.label] = answerInputs[q.label].trim();
			}
			await api.saveAnswers(job.id, answers);
			toastState.show('Answers saved');
			onClose();
			await appState.refreshJobs();
		} catch {
			actionNotice = '';
			toastState.show('Failed to save answers');
		} finally {
			busy = false;
		}
	}

	async function handleApply() {
		if (busy) return;
		busy = true;
		actionNotice = 'Submitting…';
		try {
			await api.applyToJob(job.id, {}, selectedResume || undefined);
			toastState.show('Application submitted');
			onClose();
			await appState.refreshJobs();
		} catch {
			actionNotice = '';
			toastState.show('Failed to submit application');
		} finally {
			busy = false;
		}
	}

	async function handleGetQuestions() {
		if (busy) return;
		busy = true;
		actionNotice = 'Opening form…';
		try {
			await api.getQuestions(job.id);
			toastState.show('Questions extracted');
			onClose();
			await appState.refreshJobs();
		} catch {
			actionNotice = '';
			toastState.show('Failed to extract questions');
		} finally {
			busy = false;
		}
	}

	async function handleSkip() {
		if (busy) return;
		busy = true;
		try {
			await api.skipJob(job.id);
			toastState.show('Job skipped');
			onClose();
			await appState.refreshJobs();
		} catch {
			toastState.show('Failed to skip job');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="z-modal fixed inset-0 flex items-start justify-center bg-black/72 p-4">
	<button
		class="absolute inset-0 cursor-default border-0 bg-transparent"
		type="button"
		aria-label="Close modal"
		onclick={onClose}
	></button>

	<div
		class="relative z-10 mt-12 flex max-h-[calc(100vh-96px)] min-h-[min(520px,calc(100vh-96px))] w-[min(760px,100%)] flex-col border border-border-default bg-surface-raised shadow-lg"
		role="dialog"
		aria-modal="true"
		aria-label="Job details"
		tabindex="-1"
	>
		<!-- Header -->
		<div class="flex-shrink-0 border-b border-border-subtle px-5 pb-0 pt-5">
			<div class="mb-4 flex items-start justify-between gap-4">
				<div class="min-w-0 flex-1">
					<h2 class="truncate text-base font-bold leading-tight text-text-primary">
						{job.title}
					</h2>
					<p class="mt-1 text-sm text-text-secondary">
						{job.company}
						{#if job.location}<span class="text-text-muted"> · {job.location}</span>{/if}
					</p>
				</div>
				<button
					class="inline-flex min-h-9 min-w-9 shrink-0 cursor-pointer items-center justify-center border border-border-default bg-surface-overlay p-0 text-[#4a6a88] hover:border-border-strong hover:text-[#7aaac8] focus-visible:border-border-strong focus-visible:text-[#7aaac8] focus-visible:outline-0"
					type="button"
					aria-label="Close modal"
					onclick={onClose}
				>
					<X size={16} strokeWidth={2.25} aria-hidden="true" />
				</button>
			</div>

			<div class="flex" role="tablist">
				<button
					role="tab"
					aria-selected={activeTab === 'info'}
					class="border-b-2 px-4 py-2 text-[13px] font-bold transition-colors duration-100 {activeTab === 'info' ? 'border-brand-500 text-brand-500' : 'border-transparent text-text-muted hover:text-text-secondary'}"
					onclick={() => { activeTab = 'info'; }}
				>
					Info
				</button>
				<button
					role="tab"
					aria-selected={activeTab === 'actions'}
					class="border-b-2 px-4 py-2 text-[13px] font-bold transition-colors duration-100 {activeTab === 'actions' ? 'border-brand-500 text-brand-500' : 'border-transparent text-text-muted hover:text-text-secondary'}"
					onclick={() => { activeTab = 'actions'; }}
				>
					Actions
				</button>
			</div>
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-y-auto p-5">
			{#if loadError}
				<p class="text-sm text-danger-500">Failed to load job details.</p>
			{:else if !detail}
				<div class="flex items-center justify-center py-16 text-brand-500">
					<span class="animate-spin">
						<LoaderCircle size={24} aria-label="Loading" />
					</span>
				</div>
			{:else if activeTab === 'info'}
				{#if detail.errorMessage}
					<div class="mb-4 border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-500">
						{detail.errorMessage}
					</div>
				{/if}

				{#if detail.applicationUrl}
					<div class="mb-4">
						<a
							href={detail.applicationUrl}
							target="_blank"
							rel="noreferrer noopener"
							class="inline-flex items-center gap-1.5 text-sm text-brand-500 hover:text-brand-700"
						>
							<ExternalLink size={14} aria-hidden="true" />
							Apply externally
						</a>
					</div>
				{/if}

				{#if detail.about}
					<div class="mb-6">
						<h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary">About</h3>
						<div class="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
							{detail.about}
						</div>
					</div>
				{/if}

				{#if detail.preferences.length > 0}
					<div class="mb-4">
						<h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary">Preferences</h3>
						<div class="flex flex-wrap gap-2">
							{#each detail.preferences as pref (pref)}
								<span class="border border-border-default px-2 py-1 text-xs text-text-secondary">{pref}</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if detail.skills.length > 0}
					<div class="mb-4">
						<h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary">Skills</h3>
						<div class="flex flex-wrap gap-2">
							{#each detail.skills as skill (skill)}
								<span class="border border-border-default px-2 py-1 text-xs text-text-secondary">{skill}</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if detail.questions.length > 0}
					<div>
						<h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary">Q&amp;A</h3>
						<div class="space-y-2">
							{#each detail.questions as q (q.label)}
								<div class="border border-border-subtle px-3 py-2">
									<div class="mb-1 text-xs text-text-muted">{q.label}</div>
									<div class="text-sm text-text-primary">{q.answer ?? '—'}</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{:else}
				<!-- Actions tab -->
				{#if job.status === 'FOUND'}
					<p class="mb-4 text-sm text-text-secondary">Open the application form to extract the questions, then answer them and apply.</p>
					<p class="text-xs text-text-muted">This will open a browser window and may take a few seconds.</p>
				{:else if job.status === 'SUBMITTED' || job.status === 'SKIPPED'}
					<p class="text-sm text-text-muted">No actions available.</p>
				{:else if job.status === 'FAILED'}
					{#if detail.errorMessage}
						<div class="mb-4 border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-500">
							{detail.errorMessage}
						</div>
					{/if}
					<p class="text-sm text-text-muted">This application failed. You can skip it.</p>
				{:else if job.status === 'NEEDS_INPUT'}
					{#if unanswered.length > 0}
						<div class="mb-6 space-y-4">
							{#each unanswered as q (q.label)}
								<label class="block">
									<span class="mb-1 block text-xs font-bold text-text-secondary">{q.label}</span>
									{#if q.options.length > 0}
										<select
											class="h-9 w-full border border-border-default bg-surface-overlay px-3 text-sm text-text-primary focus:border-border-strong focus:outline-0"
											bind:value={answerInputs[q.label]}
										>
											<option value="">Select…</option>
											{#each q.options as opt (opt)}
												<option value={opt}>{opt}</option>
											{/each}
										</select>
									{:else}
										<input
											type={q.fieldType ?? 'text'}
											class="h-9 w-full border border-border-default bg-surface-overlay px-3 text-sm text-text-primary focus:border-border-strong focus:outline-0"
											bind:value={answerInputs[q.label]}
										/>
									{/if}
								</label>
							{/each}
						</div>
					{/if}

					{#if answered.length > 0}
						<div>
							<h3 class="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary">Already answered</h3>
							<div class="space-y-2">
								{#each answered as q (q.label)}
									<div class="border border-border-subtle px-3 py-2">
										<div class="mb-1 text-xs text-text-muted">{q.label}</div>
										<div class="text-sm text-text-primary">{q.answer}</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{:else if job.status === 'READY_FOR_REVIEW'}
					{#if detail.questions.length > 0}
						<div class="mb-6 space-y-2">
							{#each detail.questions as q (q.label)}
								<div class="border border-border-subtle px-3 py-2">
									<div class="mb-1 text-xs text-text-muted">{q.label}</div>
									<div class="text-sm text-text-primary">{q.answer ?? '—'}</div>
								</div>
							{/each}
						</div>
					{/if}

					{#if appState.resumes.length > 0}
						<div>
							<label class="mb-2 block text-xs font-bold uppercase tracking-wide text-text-secondary" for="resume-override">
								Resume to use
							</label>
							<select
								id="resume-override"
								class="h-9 w-full border border-border-default bg-surface-overlay px-3 text-sm text-text-primary focus:border-border-strong focus:outline-0"
								bind:value={selectedResume}
							>
								<option value="">Use default{appState.defaultResume ? ` (${appState.defaultResume})` : ''}</option>
								{#each appState.resumes as r (r)}
									<option value={r}>{r}</option>
								{/each}
							</select>
						</div>
					{/if}
				{:else if job.status === 'EXTERNAL'}
					{#if detail.applicationUrl}
						<div class="mb-6">
							<a
								href={detail.applicationUrl}
								target="_blank"
								rel="noreferrer noopener"
								class="inline-flex items-center gap-1.5 text-sm text-brand-500 hover:text-brand-700"
							>
								<ExternalLink size={14} aria-hidden="true" />
								Apply externally
							</a>
						</div>
					{:else}
						<p class="mb-4 text-sm text-text-muted">No external link available.</p>
					{/if}
				{/if}
			{/if}
		</div>

		<!-- Footer -->
		{#if hasActionFooter && detail}
			<div class="flex flex-shrink-0 items-center justify-between gap-4 border-t border-border-subtle px-5 py-4">
				<span class="text-xs text-text-muted">{actionNotice}</span>
				<div class="flex gap-2">
					{#if job.status === 'FOUND'}
						<button
							class="inline-flex min-h-9 cursor-pointer items-center justify-center border border-border-default bg-surface-overlay px-4 text-[13px] font-bold text-text-secondary hover:border-border-strong hover:text-text-primary focus-visible:outline-0 disabled:cursor-not-allowed disabled:opacity-50"
							type="button"
							disabled={busy}
							onclick={handleSkip}
						>
							Skip
						</button>
						<button
							class="inline-flex min-h-9 cursor-pointer items-center justify-center border border-transparent bg-brand-500 px-4 text-[13px] font-bold text-brand-on transition-[filter] duration-100 hover:brightness-110 focus-visible:outline-0 disabled:cursor-not-allowed disabled:opacity-50"
							type="button"
							disabled={busy}
							onclick={handleGetQuestions}
						>
							{busy ? 'Opening form…' : 'Get Questions'}
						</button>
					{:else if job.status === 'NEEDS_INPUT'}
						<button
							class="inline-flex min-h-9 cursor-pointer items-center justify-center border border-border-default bg-surface-overlay px-4 text-[13px] font-bold text-text-secondary hover:border-border-strong hover:text-text-primary focus-visible:outline-0 disabled:cursor-not-allowed disabled:opacity-50"
							type="button"
							disabled={busy}
							onclick={handleSkip}
						>
							Skip
						</button>
						<button
							class="inline-flex min-h-9 cursor-pointer items-center justify-center border border-transparent bg-brand-500 px-4 text-[13px] font-bold text-brand-on transition-[filter] duration-100 hover:brightness-110 focus-visible:outline-0 disabled:cursor-not-allowed disabled:opacity-50"
							type="button"
							disabled={busy || !canSubmit}
							onclick={handleSubmitAnswers}
						>
							Save answers
						</button>
					{:else if job.status === 'READY_FOR_REVIEW'}
						<button
							class="inline-flex min-h-9 cursor-pointer items-center justify-center border border-border-default bg-surface-overlay px-4 text-[13px] font-bold text-text-secondary hover:border-border-strong hover:text-text-primary focus-visible:outline-0 disabled:cursor-not-allowed disabled:opacity-50"
							type="button"
							disabled={busy}
							onclick={handleSkip}
						>
							Skip
						</button>
						<button
							class="inline-flex min-h-9 cursor-pointer items-center justify-center border border-transparent bg-brand-500 px-4 text-[13px] font-bold text-brand-on transition-[filter] duration-100 hover:brightness-110 focus-visible:outline-0 disabled:cursor-not-allowed disabled:opacity-50"
							type="button"
							disabled={busy}
							onclick={handleApply}
						>
							Submit application
						</button>
					{:else if job.status === 'EXTERNAL'}
						<button
							class="inline-flex min-h-9 cursor-pointer items-center justify-center border border-border-default bg-surface-overlay px-4 text-[13px] font-bold text-text-secondary hover:border-border-strong hover:text-text-primary focus-visible:outline-0 disabled:cursor-not-allowed disabled:opacity-50"
							type="button"
							disabled={busy}
							onclick={handleSkip}
						>
							Skip
						</button>
					{:else if job.status === 'FAILED'}
						<button
							class="inline-flex min-h-9 cursor-pointer items-center justify-center border border-border-default bg-surface-overlay px-4 text-[13px] font-bold text-text-secondary hover:border-border-strong hover:text-text-primary focus-visible:outline-0 disabled:cursor-not-allowed disabled:opacity-50"
							type="button"
							disabled={busy}
							onclick={handleSkip}
						>
							Skip
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

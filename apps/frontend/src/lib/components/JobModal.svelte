<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { modalTransition } from '$lib/transitions';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import X from '@lucide/svelte/icons/x';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import FileText from '@lucide/svelte/icons/file-text';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import * as api from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';
	import { trapFocus } from '$lib/focusTrap';
	import { formatExactDateTime, formatFoundAt } from '$lib/dates';
	import StatusBadge from './StatusBadge.svelte';
	import type { ApplicationStatus, JobDetail, JobSummary, KanbanTab } from '$lib/types';

	const ACTION_STATUSES: ApplicationStatus[] = [
		'FOUND',
		'NEEDS_INPUT',
		'READY_FOR_REVIEW',
		'FAILED'
	];

	interface Props {
		job: JobSummary;
		initialTab?: KanbanTab;
		onOpenAgent?: (jobId: number) => void;
		onClose: () => void;
	}

	type Question = JobDetail['questions'][number];
	type IndexedQuestion = { question: Question; index: number };
	const modalTabs: { id: KanbanTab; label: string }[] = [
		{ id: 'info', label: 'Information' },
		{ id: 'actions', label: 'Actions' }
	];

	let { job, initialTab = 'info', onOpenAgent, onClose }: Props = $props();

	let detail = $state<JobDetail | null>(null);
	let loadError = $state(false);
	let activeTab = $state<KanbanTab>(untrack(() => initialTab));
	let busy = $state(false);
	let notice = $state('');
	let answerInputs = $state<Record<string, string>>({});
	let selectedResume = $state('');
	let tailoring = $state(false);
	let tailored = $state(false);
	let tailoredMaster = $state<string | null>(null);
	let tailorVersion = $state(0);
	let masterOptions = $state<string[]>([]);
	let tailorMenuOpen = $state(false);
	let tailorMenuStyle = $state('');
	let tailorButtonRef = $state<HTMLButtonElement | null>(null);
	let tailorMenuRef = $state<HTMLElement | null>(null);
	/** Stops the tailoring poll loop once the modal is gone. */
	let cancelled = false;

	onDestroy(() => {
		cancelled = true;
	});

	onMount(async () => {
		api
			.listMasters()
			.then((r) => (masterOptions = r.masters))
			.catch(() => {});
		try {
			const [tailoredRes, jobDetail] = await Promise.all([
				api
					.getTailored(job.id)
					.catch(() => ({ exists: false, master: null, updatedAt: null, tailoring: false })),
				api.getJob(job.id)
			]);
			tailored = tailoredRes.exists;
			tailoredMaster = tailoredRes.master;
			// Adopt the backend's in-flight state so reopening the modal mid-run still shows
			// "Tailoring…" and keeps the button disabled.
			if (tailoredRes.tailoring) {
				tailoring = true;
				pollTailoring();
			}
			detail = jobDetail;
			selectedResume = tailored ? 'tailored' : (jobDetail.resumeFilename ?? '');
			if (job.status === 'READY_FOR_REVIEW' || job.status === 'APPROVED') {
				for (const [index, q] of jobDetail.questions.entries()) {
					if (q.answer != null) answerInputs[inputKey(q, index)] = q.answer;
				}
			}
		} catch {
			loadError = true;
		}
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && tailorMenuOpen) {
			tailorMenuOpen = false;
			return;
		}
		if (e.key === 'Escape') onClose();
	}

	function hasAnswerValue(value: string | null | undefined): boolean {
		return value !== null && value !== undefined && value.trim().length > 0;
	}

	function inputKey(q: Question, index: number): string {
		return `${index}:${q.label}`;
	}

	function questionKey(item: IndexedQuestion): string {
		return inputKey(item.question, item.index);
	}

	function currentAnswer(q: Question, index: number): string {
		return answerInputs[inputKey(q, index)] ?? q.answer ?? '';
	}

	function collectCurrentAnswers(): Record<string, string> {
		const answers: Record<string, string> = {};
		for (const [index, q] of (detail?.questions ?? []).entries()) {
			const answer = currentAnswer(q, index).trim();
			if (answer) answers[q.label] = answer;
		}
		return answers;
	}

	function selectedResumePreviewUrl(): string | null {
		if (selectedResume === 'tailored')
			return tailored ? api.tailorPreviewUrl(job.id, tailorVersion) : null;
		if (selectedResume) return api.resumePreviewUrl(selectedResume);
		return appState.defaultResume ? api.resumePreviewUrl(appState.defaultResume) : null;
	}

	function positionTailorMenu() {
		if (!tailorButtonRef) return;
		const rect = tailorButtonRef.getBoundingClientRect();
		const pad = 8;
		const mobile = window.innerWidth < 640;
		const width = mobile ? window.innerWidth - pad * 2 : Math.min(320, window.innerWidth - pad * 2);
		const left = mobile
			? pad
			: Math.min(Math.max(pad, rect.right - width), window.innerWidth - width - pad);
		const below = window.innerHeight - rect.bottom - pad;
		const above = rect.top - pad;
		const openBelow = below >= 180 || below >= above;
		const maxHeight = Math.max(144, Math.min(256, (openBelow ? below : above) - 4));
		const top = openBelow ? rect.bottom + 4 : Math.max(pad, rect.top - maxHeight - 4);
		const origin = openBelow ? 'top right' : 'bottom right';
		tailorMenuStyle = `left: ${left}px; top: ${top}px; width: ${width}px; max-height: ${maxHeight}px; --dropdown-origin: ${origin};`;
	}

	function toggleTailorMenu() {
		if (tailorMenuOpen) {
			tailorMenuOpen = false;
			return;
		}
		positionTailorMenu();
		tailorMenuOpen = true;
	}

	function handleDialogClick(e: MouseEvent) {
		const target = e.target as Node;
		if (tailorMenuOpen && !tailorMenuRef?.contains(target) && !tailorButtonRef?.contains(target)) {
			tailorMenuOpen = false;
		}
		e.stopPropagation();
	}

	const questions = $derived(
		detail?.questions.map((question, index) => ({ question, index })) ?? []
	);
	const unanswered = $derived(questions.filter(({ question }) => question.answer == null));
	const answered = $derived(questions.filter(({ question }) => question.answer != null));
	const canSave = $derived(
		unanswered.every(({ question, index }) =>
			hasAnswerValue(answerInputs[inputKey(question, index)])
		)
	);
	const canApply = $derived(
		detail !== null &&
			questions.every(
				({ question, index }) =>
					!hasAnswerValue(question.answer) || hasAnswerValue(currentAnswer(question, index))
			)
	);
	const hasActions = $derived(ACTION_STATUSES.includes(job.status));
	const selectedPreviewUrl = $derived(selectedResumePreviewUrl());
	const agentSession = $derived(
		appState.externalApply.sessions.find((session) => session.jobId === job.id)
	);
	const agentActive = $derived(agentSession?.active ?? false);
	const externalApplication = $derived((detail?.applicationUrl ?? job.applicationUrl) != null);
	const externalAgentAction = $derived(
		externalApplication && (job.status === 'NEEDS_INPUT' || job.status === 'READY_FOR_REVIEW')
	);

	async function handleSaveAnswers() {
		if (busy) return;
		busy = true;
		notice = 'Saving...';
		try {
			const answers: Record<string, string> = {};
			for (const { question, index } of unanswered) {
				const answer = answerInputs[inputKey(question, index)]?.trim();
				if (answer) answers[question.label] = answer;
			}
			await api.saveAnswers(job.id, answers);
			toastState.show('Answers saved', 'success');
			onClose();
			await appState.refreshJobs();
		} catch {
			notice = '';
			toastState.show('Failed to save answers', 'error');
		} finally {
			busy = false;
		}
	}

	async function handleApply() {
		if (busy) return;
		busy = true;
		notice = 'Queueing application...';
		try {
			const resumeFilename =
				selectedResume && selectedResume !== 'tailored' ? selectedResume : undefined;
			await api.applyToJob(job.id, collectCurrentAnswers(), resumeFilename);
			toastState.show('Application queued', 'success');
			onClose();
			await appState.refreshJobs();
		} catch {
			notice = '';
			toastState.show('Failed to queue application', 'error');
		} finally {
			busy = false;
		}
	}

	async function handleReject() {
		if (busy) return;
		busy = true;
		try {
			await api.rejectJob(job.id);
			toastState.show('Job rejected', 'success');
			onClose();
			await appState.refreshJobs();
		} catch {
			toastState.show('Failed to reject job', 'error');
		} finally {
			busy = false;
		}
	}

	async function handleRetry() {
		if (busy) return;
		busy = true;
		notice = 'Retrying...';
		try {
			await api.retryJob(job.id);
			toastState.show('Job queued for retry', 'success');
			onClose();
			await appState.refreshJobs();
		} catch {
			notice = '';
			toastState.show('Failed to retry job', 'error');
		} finally {
			busy = false;
		}
	}

	/**
	 * Watches a tailoring run that was started elsewhere (auto-tailor, or a previous visit to this
	 * modal) until the backend reports it finished, then refreshes the tailored-resume state.
	 */
	async function pollTailoring() {
		while (!cancelled) {
			await new Promise((r) => setTimeout(r, 1500));
			if (cancelled) return;
			try {
				const res = await api.getTailored(job.id);
				if (!res.tailoring) {
					tailoring = false;
					tailored = res.exists;
					tailoredMaster = res.master;
					if (res.exists) {
						selectedResume = 'tailored';
						tailorVersion = Date.now();
					}
					return;
				}
			} catch {
				tailoring = false;
				return;
			}
		}
	}

	async function handleTailor(master?: string) {
		if (tailoring) return;
		tailorMenuOpen = false;
		tailoring = true;
		try {
			const res = await api.tailorJob(job.id, master);
			tailored = true;
			tailoredMaster = res.master;
			selectedResume = 'tailored';
			tailorVersion = Date.now();
			toastState.show(
				res.deduped
					? `Already tailoring — finished via “${res.master}”`
					: `Resume tailored via “${res.master}”`,
				'success'
			);
		} catch (e) {
			const noMaster = e instanceof Error && e.message.startsWith('400');
			toastState.show(
				noMaster ? 'Create a master resume in Settings first' : 'Failed to tailor resume',
				'error'
			);
		} finally {
			tailoring = false;
		}
	}

	function parseCheckboxAnswer(answer: string, options: string[]): string[] {
		return options.filter((opt) => answer.includes(opt));
	}

	function toggleCheckbox(key: string, opt: string, options: string[]) {
		const current = parseCheckboxAnswer(answerInputs[key] ?? '', options);
		const idx = current.indexOf(opt);
		if (idx >= 0) current.splice(idx, 1);
		else current.push(opt);
		answerInputs[key] = current.join(', ');
	}
</script>

<svelte:window
	onkeydown={onKeydown}
	onresize={() => {
		if (tailorMenuOpen) positionTailorMenu();
	}}
/>

{#snippet questionInput(q: Question, key: string)}
	{#if q.fieldType === 'checkbox' && q.options.length > 0}
		{@const selected = parseCheckboxAnswer(answerInputs[key] ?? '', q.options)}
		<div class="flex flex-wrap gap-2 sm:gap-x-4 sm:gap-y-1.5">
			{#each q.options as opt (`${key}:${opt}`)}
				<label
					class="flex min-h-9 cursor-pointer items-center gap-2 rounded-md bg-surface-overlay px-2.5 text-sm text-text-secondary hover:text-text-primary sm:min-h-0 sm:bg-transparent sm:px-0"
				>
					<input
						type="checkbox"
						class="h-4 w-4 accent-accent-500 sm:h-auto sm:w-auto"
						checked={selected.includes(opt)}
						onchange={() => toggleCheckbox(key, opt, q.options)}
					/>
					{opt}
				</label>
			{/each}
		</div>
	{:else if q.options.length > 0}
		<select
			class="h-11 w-full rounded-md border border-border-default bg-surface-overlay px-3 text-base text-text-primary focus:border-border-strong focus:outline-none sm:h-8 sm:px-2.5 sm:text-sm"
			bind:value={answerInputs[key]}
		>
			<option value="">Select...</option>
			{#each q.options as opt, i (`${i}:${opt}`)}
				<option value={opt}>{opt}</option>
			{/each}
		</select>
	{:else}
		<input
			type="text"
			inputmode={q.fieldType === 'number' ? 'decimal' : undefined}
			class="h-11 w-full rounded-md border border-border-default bg-surface-overlay px-3 text-base text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none sm:h-8 sm:px-2.5 sm:text-sm"
			bind:value={answerInputs[key]}
		/>
	{/if}
{/snippet}

{#snippet actionPanel(
	title: string,
	body: string,
	tone: 'neutral' | 'review' | 'success' | 'danger'
)}
	<div
		class="mb-5 rounded-md border px-3 py-2.5 {tone === 'review'
			? 'border-status-review-border bg-status-review-bg'
			: tone === 'success'
				? 'border-status-submitted-border bg-status-submitted-bg'
				: tone === 'danger'
					? 'border-danger-border bg-danger-bg'
					: 'border-border-subtle bg-surface-overlay'}"
	>
		<p
			class="text-sm font-medium {tone === 'review'
				? 'text-status-review-text'
				: tone === 'success'
					? 'text-status-submitted-text'
					: tone === 'danger'
						? 'text-danger-500'
						: 'text-text-secondary'}"
		>
			{title}
		</p>
		<p
			class="mt-1 text-[13px] leading-relaxed {tone === 'danger'
				? 'text-danger-500'
				: 'text-text-faint'}"
		>
			{body}
		</p>
	</div>
{/snippet}

{#snippet actionSection(title: string, body?: string)}
	<div class="mb-3">
		<h3 class="text-[13px] font-semibold text-text-primary">{title}</h3>
		{#if body}
			<p class="mt-1 text-[12px] leading-relaxed text-text-faint">{body}</p>
		{/if}
	</div>
{/snippet}

<div class="fixed inset-0 z-modal flex items-start justify-center bg-black/70 p-0 sm:p-4">
	<button class="absolute inset-0 cursor-default" type="button" aria-label="Close" onclick={onClose}
	></button>

	<div
		class="relative z-10 flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col border border-border-default bg-surface-raised shadow-[var(--shadow-modal)] sm:mt-12 sm:h-auto sm:max-h-[calc(100vh-96px)] sm:w-[min(680px,100%)] sm:rounded-lg"
		role="dialog"
		aria-modal="true"
		aria-label="Job details"
		tabindex="-1"
		use:trapFocus={{ onEscape: onClose }}
		transition:fly={modalTransition}
		onclick={handleDialogClick}
		onkeydown={(e) => e.stopPropagation()}
	>
		<div class="flex-shrink-0 border-b border-border-subtle px-4 pt-3 pb-0 sm:pt-4">
			<div class="mb-2 flex items-start justify-between gap-3 sm:mb-3">
				<div class="min-w-0 flex-1">
					<h2 class="truncate text-base font-semibold text-text-primary">{job.title}</h2>
					<p class="mt-0.5 text-[13px] text-text-muted">
						{job.company}
						{#if job.location}
							· {job.location}{/if}
					</p>
					<p class="mt-1 text-[12px] text-text-faint" title={`Found ${formatExactDateTime(job.createdAt)}`}>
						Found {formatFoundAt(job.createdAt)}
					</p>
					<div class="mt-2 flex items-center gap-2">
						<StatusBadge status={job.status} size="sm" />
						{#if agentSession && onOpenAgent}
							<button
								type="button"
								class="flex cursor-pointer items-center gap-1 rounded-sm border border-border-default bg-surface-overlay px-1.5 py-0.5 text-xs font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-primary focus-visible:outline-none"
								onclick={() => onOpenAgent?.(job.id)}
							>
								{#if agentActive}
									<LoaderCircle
										size={11}
										class="activity-spin text-accent-500"
										aria-hidden="true"
									/>
								{/if}
								Agent session
							</button>
						{:else if externalAgentAction}
							<span
								class="flex items-center gap-1 rounded-sm border border-border-default bg-surface-overlay px-1.5 py-0.5 text-xs font-medium text-text-faint"
							>
								<LoaderCircle size={11} class="activity-spin text-text-faint" aria-hidden="true" />
								Waiting for agent
							</span>
						{/if}
						{#if job.url}
							<a
								href={job.url}
								target="_blank"
								rel="noreferrer noopener"
								class="flex cursor-pointer items-center gap-1 text-xs text-text-faint transition-colors duration-150 hover:text-text-muted"
							>
								<ExternalLink size={10} aria-hidden="true" />
								LinkedIn
							</a>
						{/if}
					</div>
				</div>
				<button
					type="button"
					class="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-md text-text-faint transition-colors duration-150 hover:bg-surface-overlay hover:text-text-muted focus-visible:outline-none sm:h-7 sm:w-7"
					onclick={onClose}
					aria-label="Close"
				>
					<X size={14} aria-hidden="true" />
				</button>
			</div>

			<div class="flex" role="tablist">
				{#each modalTabs as tab (tab.id)}
					<button
						role="tab"
						aria-selected={activeTab === tab.id}
						class="cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-100
						{activeTab === tab.id
							? 'border-text-primary text-text-primary'
							: 'border-transparent text-text-faint hover:text-text-muted'}"
						onclick={() => {
							activeTab = tab.id;
							tailorMenuOpen = false;
						}}
					>
						{tab.label}
					</button>
				{/each}
			</div>
		</div>

		<div class="min-h-0 flex-1 scroll-pb-28 overflow-y-auto overscroll-contain p-4 pb-6">
			{#if loadError}
				<p class="text-sm text-danger-600">Failed to load job details.</p>
			{:else if !detail}
				<div class="flex items-center justify-center py-16 text-text-faint">
					<LoaderCircle size={20} class="activity-spin" aria-label="Loading" />
				</div>
			{:else}
				{#key activeTab}
					<div in:fade={{ duration: 120 }}>
						{#if activeTab === 'info'}
							{#if detail.errorMessage}
								<div class="mb-4 rounded-md bg-danger-bg px-3 py-2 text-[13px] text-danger-600">
									{detail.errorMessage}
								</div>
							{/if}

							{#if detail.applicationUrl}
								<div class="mb-4">
									<a
										href={detail.applicationUrl}
										target="_blank"
										rel="noreferrer noopener"
										class="flex cursor-pointer items-center gap-1.5 text-sm text-accent-500 hover:underline"
									>
										<ExternalLink size={12} aria-hidden="true" />
										External application
									</a>
								</div>
							{/if}

							{#if detail.about}
								<div class="mb-5">
									<h3 class="mb-1.5 text-[13px] font-semibold text-text-primary">About</h3>
									<div class="max-h-72 overflow-y-auto text-[13px] leading-relaxed text-text-muted">
										{detail.about}
									</div>
								</div>
							{/if}

							{#if detail.skills.length > 0}
								<div class="mb-4">
									<h3 class="mb-1.5 text-[13px] font-semibold text-text-primary">Skills</h3>
									<div class="flex flex-wrap gap-1.5">
										{#each detail.skills as skill (skill)}
											<span
												class="rounded-sm bg-surface-overlay px-1.5 py-0.5 text-xs text-text-muted"
												>{skill}</span
											>
										{/each}
									</div>
								</div>
							{/if}

							{#if detail.preferences.length > 0}
								<div class="mb-4">
									<h3 class="mb-1.5 text-[13px] font-semibold text-text-primary">Preferences</h3>
									<div class="flex flex-wrap gap-1.5">
										{#each detail.preferences as pref (pref)}
											<span
												class="rounded-sm bg-surface-overlay px-1.5 py-0.5 text-xs text-text-muted"
												>{pref}</span
											>
										{/each}
									</div>
								</div>
							{/if}

							{#if detail.questions.length > 0}
								<div>
									<h3 class="mb-1.5 text-[13px] font-semibold text-text-primary">Q&A</h3>
									<div class="space-y-2">
										{#each questions as item (questionKey(item))}
											{@const q = item.question}
											<div class="rounded-md bg-surface-overlay px-3 py-2">
												<p class="text-xs text-text-faint">{q.label}</p>
												<p class="mt-0.5 text-[13px] text-text-secondary">{q.answer ?? '—'}</p>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						{:else if job.status === 'FOUND'}
							{@render actionPanel(
								'Ready to inspect',
								'This job has been found but no application questions have been extracted yet. Start the next execution cycle to inspect the form, or reject it if it is not worth applying to.',
								'neutral'
							)}
						{:else if job.status === 'NEEDS_INPUT'}
							{#if externalApplication}
								{@render actionPanel(
									'Agent needs your input',
									'Open the agent session and answer there so it can continue from the live application browser.',
									'neutral'
								)}
							{:else if unanswered.length > 0}
								{@render actionSection(
									'Missing answers',
									'Answer every required question before queueing this application.'
								)}
								<div class="mb-5 space-y-3">
									{#each unanswered as item (questionKey(item))}
										{@const q = item.question}
										{@const key = inputKey(q, item.index)}
										<div class="block">
											<span class="mb-1 block text-[13px] font-medium text-text-secondary"
												>{q.label}</span
											>
											{@render questionInput(q, key)}
										</div>
									{/each}
								</div>
							{/if}

							{#if answered.length > 0}
								<div>
									{@render actionSection('Already answered')}
									<div class="space-y-1.5">
										{#each answered as item (questionKey(item))}
											{@const q = item.question}
											<div class="rounded-md bg-surface-overlay px-3 py-2">
												<p class="text-xs text-text-faint">{q.label}</p>
												<p class="mt-0.5 text-[13px] text-text-secondary">{q.answer}</p>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						{:else if job.status === 'READY_FOR_REVIEW'}
							{#if externalApplication}
								{@render actionPanel(
									'Ready for agent review',
									'Review the live browser and approve the final submit inside the agent session.',
									'review'
								)}
							{:else if detail.questions.length > 0}
								{@render actionSection(
									'Review answers',
									'Confirm the answers and resume before queueing the application.'
								)}
								<div class="mb-5 space-y-3">
									{#each questions as item (questionKey(item))}
										{@const q = item.question}
										{@const key = inputKey(q, item.index)}
										<div class="block">
											<span class="mb-1 block text-[13px] font-medium text-text-secondary"
												>{q.label}</span
											>
											{@render questionInput(q, key)}
										</div>
									{/each}
								</div>
							{/if}

							<div>
								{@render actionSection(
									'Resume',
									'Select the resume that should be used when this application is submitted.'
								)}
								<label class="sr-only" for="resume-select"> Resume </label>
								<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
									<select
										id="resume-select"
										class="h-11 min-w-0 flex-1 rounded-md border border-border-default bg-surface-overlay px-3 text-base text-text-primary focus:border-border-strong focus:outline-none sm:h-8 sm:px-2.5 sm:text-sm"
										bind:value={selectedResume}
									>
										<option value=""
											>Default{appState.defaultResume ? ` (${appState.defaultResume})` : ''}</option
										>
										{#if tailored}
											<option value="tailored">Tailored from {tailoredMaster ?? 'master'}</option>
										{/if}
										{#each appState.resumes as r (r)}
											<option value={r}>{r}</option>
										{/each}
									</select>

									{#if selectedPreviewUrl}
										<a
											href={selectedPreviewUrl}
											target="_blank"
											rel="noopener"
											class="inline-flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border-default bg-surface-overlay px-3 text-sm font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary focus-visible:outline-none sm:h-8"
										>
											<ExternalLink size={13} aria-hidden="true" />
											Preview
										</a>
									{:else}
										<button
											type="button"
											disabled
											class="inline-flex h-11 cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-border-default bg-surface-overlay px-3 text-sm font-medium text-text-muted opacity-40 sm:h-8"
										>
											<ExternalLink size={13} aria-hidden="true" />
											Preview
										</button>
									{/if}

									<div class="w-full sm:w-auto">
										<button
											bind:this={tailorButtonRef}
											type="button"
											class="flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border-default bg-surface-overlay px-3 text-sm font-medium whitespace-nowrap text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-auto"
											disabled={tailoring || masterOptions.length === 0}
											aria-haspopup="menu"
											aria-expanded={tailorMenuOpen}
											title={masterOptions.length === 0
												? 'Create a master resume in Settings first'
												: 'Choose master resume to tailor from'}
											onclick={toggleTailorMenu}
										>
											<Sparkles size={13} aria-hidden="true" />
											{tailoring ? 'Tailoring…' : 'Tailor resume'}
											<ChevronDown size={13} aria-hidden="true" />
										</button>

										{#if tailorMenuOpen && masterOptions.length > 0}
											<div
												bind:this={tailorMenuRef}
												role="menu"
												class="t-dropdown is-open fixed z-modal overflow-y-auto rounded-md border border-border-default bg-surface-raised p-1 shadow-[var(--shadow-modal)]"
												style={tailorMenuStyle}
											>
												<p class="px-2 py-1 text-[10px] font-medium text-text-faint">
													Choose tailoring source
												</p>
												<button
													type="button"
													role="menuitem"
													class="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left text-xs text-text-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none sm:min-h-8 sm:py-1.5 sm:text-[11px]"
													onclick={() => handleTailor()}
												>
													<Sparkles
														size={12}
														class="flex-shrink-0 text-text-faint"
														aria-hidden="true"
													/>
													<span class="min-w-0 flex-1 truncate">Auto-select best match</span>
													<span class="flex-shrink-0 text-[9px] font-bold text-text-faint">AI</span>
												</button>
												{#each masterOptions as m (m)}
													<button
														type="button"
														role="menuitem"
														title={m}
														class="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left text-xs text-text-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none sm:min-h-8 sm:py-1.5 sm:text-[11px]"
														onclick={() => handleTailor(m)}
													>
														<FileText
															size={12}
															class="flex-shrink-0 text-text-faint"
															aria-hidden="true"
														/>
														<span class="min-w-0 flex-1 truncate">{m}</span>
													</button>
												{/each}
											</div>
										{/if}
									</div>
								</div>
							</div>
						{:else if job.status === 'APPROVED'}
							{@render actionPanel(
								'Application queued',
								'This job is queued for the next execution cycle. No manual action is needed right now.',
								'success'
							)}
						{:else if job.status === 'FAILED'}
							{@render actionPanel(
								'Application stopped',
								detail.errorMessage ??
									'Retry this job to send it back through the application flow.',
								'danger'
							)}
						{:else}
							{@render actionPanel(
								'No action available',
								'This job does not have an available action in its current state.',
								'neutral'
							)}
						{/if}
					</div>
				{/key}
			{/if}
		</div>

		{#if hasActions && detail}
			<div
				class="flex flex-shrink-0 flex-col gap-2 border-t border-border-subtle px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:pb-3"
			>
				<span
					class="min-h-4 text-[13px] text-text-faint {notice ? 'block' : 'hidden sm:block'}"
					aria-live="polite">{notice}</span
				>
				<div
					class="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:w-auto sm:justify-end"
				>
					{#if ACTION_STATUSES.includes(job.status)}
						<button
							type="button"
							class="h-11 cursor-pointer rounded-md border border-border-default bg-surface-overlay px-3 text-sm font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 sm:h-8"
							disabled={busy || job.processing}
							onclick={handleReject}
						>
							Reject
						</button>
					{/if}

					{#if job.status === 'NEEDS_INPUT'}
						{#if externalApplication}
							{#if agentSession && onOpenAgent}
								<button
									type="button"
									class="h-11 w-full cursor-pointer rounded-md bg-accent-500 px-3 text-sm font-medium text-accent-text transition-colors duration-150 hover:bg-accent-600 focus-visible:outline-none sm:h-8 sm:w-auto"
									onclick={() => onOpenAgent?.(job.id)}
								>
									Open agent session
								</button>
							{:else}
								<button
									type="button"
									class="h-11 w-full cursor-wait rounded-md bg-surface-overlay px-3 text-sm font-medium text-text-faint sm:h-8 sm:w-auto"
									disabled
								>
									Agent restarting…
								</button>
							{/if}
						{:else if unanswered.length > 0}
							<button
								type="button"
								class="h-11 w-full cursor-pointer rounded-md bg-accent-500 px-3 text-sm font-medium text-accent-text transition-colors duration-150 hover:bg-accent-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-auto"
								disabled={busy || !canSave}
								onclick={handleSaveAnswers}
							>
								Save answers
							</button>
						{:else}
							<button
								type="button"
								class="h-11 w-full cursor-pointer rounded-md bg-accent-500 px-3 text-sm font-medium text-accent-text transition-colors duration-150 hover:bg-accent-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-auto"
								disabled={busy || !canApply}
								onclick={handleApply}
							>
								{busy ? 'Queueing...' : 'Submit application'}
							</button>
						{/if}
					{:else if job.status === 'READY_FOR_REVIEW'}
						{#if externalApplication}
							{#if agentSession && onOpenAgent}
								<button
									type="button"
									class="h-11 w-full cursor-pointer rounded-md bg-accent-500 px-3 text-sm font-medium text-accent-text transition-colors duration-150 hover:bg-accent-600 focus-visible:outline-none sm:h-8 sm:w-auto"
									onclick={() => onOpenAgent?.(job.id)}
								>
									Review with agent
								</button>
							{:else}
								<button
									type="button"
									class="h-11 w-full cursor-wait rounded-md bg-surface-overlay px-3 text-sm font-medium text-text-faint sm:h-8 sm:w-auto"
									disabled
								>
									Agent restarting…
								</button>
							{/if}
						{:else}
							<button
								type="button"
								class="h-11 w-full cursor-pointer rounded-md bg-accent-500 px-3 text-sm font-medium text-accent-text transition-colors duration-150 hover:bg-accent-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-auto"
								disabled={busy || !canApply}
								onclick={handleApply}
							>
								{busy ? 'Queueing...' : 'Submit application'}
							</button>
						{/if}
					{:else if job.status === 'FAILED'}
						<button
							type="button"
							class="h-11 w-full cursor-pointer rounded-md bg-accent-500 px-3 text-sm font-medium text-accent-text transition-colors duration-150 hover:bg-accent-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-auto"
							disabled={busy || job.processing}
							onclick={handleRetry}
						>
							{busy ? 'Retrying...' : 'Retry'}
						</button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

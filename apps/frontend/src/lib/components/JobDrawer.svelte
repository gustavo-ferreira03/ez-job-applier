<script lang="ts">
	import { fly } from 'svelte/transition';
	import { onMount } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import * as api from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import type { JobDetail, JobSummary, KanbanTab } from '$lib/types';

	interface Props {
		job: JobSummary;
		initialTab?: KanbanTab;
		onClose: () => void;
	}

	let { job, initialTab = 'info', onClose }: Props = $props();

	let detail = $state<JobDetail | null>(null);
	let loadError = $state(false);
	let activeTab = $state<KanbanTab>(initialTab);
	let busy = $state(false);
	let notice = $state('');
	let answerInputs = $state<Record<string, string>>({});
	let selectedResume = $state(job.resumeFilename ?? '');

	onMount(async () => {
		try {
			detail = await api.getJob(job.id);
			selectedResume = detail.resumeFilename ?? '';
			if (job.status === 'READY_FOR_REVIEW') {
				for (const q of detail.questions) {
					if (q.answer != null) answerInputs[q.label] = q.answer;
				}
			}
		} catch {
			loadError = true;
		}
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	const unanswered = $derived(detail?.questions.filter((q) => q.answer == null) ?? []);
	const answered   = $derived(detail?.questions.filter((q) => q.answer != null) ?? []);
	const canSave    = $derived(unanswered.every((q) => answerInputs[q.label]?.trim()));

	const hasActions = $derived(
		['FOUND', 'NEEDS_INPUT', 'READY_FOR_REVIEW', 'EXTERNAL', 'FAILED'].includes(job.status)
	);

	async function handleGetQuestions() {
		if (busy) return;
		busy = true; notice = 'Abrindo formulário…';
		try {
			await api.getQuestions(job.id);
			toastState.show('Perguntas extraídas');
			onClose();
			await appState.refreshJobs();
		} catch { notice = ''; toastState.show('Falha ao extrair perguntas'); }
		finally { busy = false; }
	}

	async function handleSaveAnswers() {
		if (busy) return;
		busy = true; notice = 'Salvando…';
		try {
			const answers: Record<string, string> = {};
			for (const q of unanswered) {
				if (answerInputs[q.label]?.trim()) answers[q.label] = answerInputs[q.label].trim();
			}
			await api.saveAnswers(job.id, answers);
			toastState.show('Respostas salvas');
			onClose();
			await appState.refreshJobs();
		} catch { notice = ''; toastState.show('Falha ao salvar respostas'); }
		finally { busy = false; }
	}

	async function handleApply() {
		if (busy) return;
		busy = true; notice = 'Enviando candidatura…';
		try {
			if (Object.keys(answerInputs).length > 0) await api.saveAnswers(job.id, answerInputs);
			await api.applyToJob(job.id, answerInputs, selectedResume || undefined);
			toastState.show('Candidatura enviada');
			onClose();
			await appState.refreshJobs();
		} catch { notice = ''; toastState.show('Falha ao enviar candidatura'); }
		finally { busy = false; }
	}

	async function handleSkip() {
		if (busy) return;
		busy = true;
		try {
			await api.skipJob(job.id);
			toastState.show('Vaga ignorada');
			onClose();
			await appState.refreshJobs();
		} catch { toastState.show('Falha ao ignorar vaga'); }
		finally { busy = false; }
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Backdrop -->
<div
	class="fixed inset-0 z-drawer bg-transparent"
	role="presentation"
	onclick={onClose}
></div>

<!-- Painel -->
<div
	class="fixed right-0 top-0 z-drawer flex h-full w-[340px] flex-col border-l border-border-default bg-surface-raised shadow-[var(--shadow-drawer)]"
	role="dialog"
	aria-modal="true"
	aria-label="Detalhes da vaga"
	transition:fly={{ x: 340, duration: 220, opacity: 1 }}
	onclick={(e) => e.stopPropagation()}
>
	<!-- Cabeçalho -->
	<div class="flex-shrink-0 border-b border-border-subtle px-4 pb-0 pt-4">
		<div class="mb-3 flex items-start justify-between gap-3">
			<div class="min-w-0 flex-1">
				<h2 class="truncate text-[13px] font-semibold text-text-primary">{job.title}</h2>
				<p class="mt-0.5 text-[11px] text-text-muted">
					{job.company}
					{#if job.location} · {job.location}{/if}
				</p>
				<div class="mt-2 flex items-center gap-2">
					<StatusBadge status={job.status} size="sm" />
					{#if job.url}
						<a
							href={job.url}
							target="_blank"
							rel="noreferrer noopener"
							class="flex items-center gap-1 text-[10px] text-text-faint hover:text-text-muted"
						>
							<ExternalLink size={10} aria-hidden="true" />
							LinkedIn
						</a>
					{/if}
				</div>
			</div>
			<button
				type="button"
				class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-text-faint hover:bg-surface-overlay hover:text-text-muted focus-visible:outline-none"
				onclick={onClose}
				aria-label="Fechar"
			>
				<X size={14} aria-hidden="true" />
			</button>
		</div>

		<!-- Abas -->
		<div class="flex" role="tablist">
			{#each (['info', 'actions'] as KanbanTab[]) as tab (tab)}
				<button
					role="tab"
					aria-selected={activeTab === tab}
					class="border-b-2 px-3 py-2 text-[12px] font-medium transition-colors duration-100
						{activeTab === tab
							? 'border-text-primary text-text-primary'
							: 'border-transparent text-text-faint hover:text-text-muted'}"
					onclick={() => { activeTab = tab; }}
				>
					{tab === 'info' ? 'Informações' : 'Ações'}
				</button>
			{/each}
		</div>
	</div>

	<!-- Conteúdo -->
	<div class="flex-1 overflow-y-auto p-4">
		{#if loadError}
			<p class="text-[12px] text-[#ef4444]">Falha ao carregar detalhes da vaga.</p>
		{:else if !detail}
			<div class="flex items-center justify-center py-16 text-text-faint">
				<LoaderCircle size={20} class="animate-spin" aria-label="Carregando" />
			</div>
		{:else if activeTab === 'info'}
			<!-- Aba Informações -->
			{#if detail.errorMessage}
				<div class="mb-4 rounded-md bg-[#1c0a0a] px-3 py-2 text-[11px] text-[#ef4444]">
					{detail.errorMessage}
				</div>
			{/if}

			{#if detail.applicationUrl}
				<div class="mb-4">
					<a
						href={detail.applicationUrl}
						target="_blank"
						rel="noreferrer noopener"
						class="flex items-center gap-1.5 text-[12px] text-[#3b82f6] hover:underline"
					>
						<ExternalLink size={12} aria-hidden="true" />
						Candidatura externa
					</a>
				</div>
			{/if}

			{#if detail.about}
				<div class="mb-5">
					<h3 class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Sobre</h3>
					<div class="max-h-40 overflow-y-auto text-[11px] leading-relaxed text-text-muted">
						{detail.about}
					</div>
				</div>
			{/if}

			{#if detail.skills.length > 0}
				<div class="mb-4">
					<h3 class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Skills</h3>
					<div class="flex flex-wrap gap-1.5">
						{#each detail.skills as skill (skill)}
							<span class="rounded-sm bg-surface-overlay px-1.5 py-0.5 text-[10px] text-text-muted">{skill}</span>
						{/each}
					</div>
				</div>
			{/if}

			{#if detail.preferences.length > 0}
				<div class="mb-4">
					<h3 class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Preferências</h3>
					<div class="flex flex-wrap gap-1.5">
						{#each detail.preferences as pref (pref)}
							<span class="rounded-sm bg-surface-overlay px-1.5 py-0.5 text-[10px] text-text-muted">{pref}</span>
						{/each}
					</div>
				</div>
			{/if}

			{#if detail.questions.length > 0}
				<div>
					<h3 class="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Q&A</h3>
					<div class="space-y-2">
						{#each detail.questions as q (q.label)}
							<div class="rounded-md bg-surface-overlay px-3 py-2">
								<p class="text-[10px] text-text-faint">{q.label}</p>
								<p class="mt-0.5 text-[11px] text-text-secondary">{q.answer ?? '—'}</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}

		{:else}
			<!-- Aba Ações -->
			{#if job.status === 'FOUND'}
				<p class="mb-3 text-[12px] text-text-muted">Abra o formulário de candidatura para extrair as perguntas.</p>
				<p class="text-[11px] text-text-faint">Isso abrirá um browser e pode levar alguns segundos.</p>

			{:else if job.status === 'NEEDS_INPUT'}
				{#if unanswered.length > 0}
					<div class="mb-5 space-y-3">
						{#each unanswered as q (q.label)}
							<label class="block">
								<span class="mb-1 block text-[11px] font-medium text-text-secondary">{q.label}</span>
								{#if q.options.length > 0}
									<select
										class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
										bind:value={answerInputs[q.label]}
									>
										<option value="">Selecione…</option>
										{#each q.options as opt (opt)}
											<option value={opt}>{opt}</option>
										{/each}
									</select>
								{:else}
									<input
										type={q.fieldType ?? 'text'}
										class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
										bind:value={answerInputs[q.label]}
									/>
								{/if}
							</label>
						{/each}
					</div>
				{/if}

				{#if answered.length > 0}
					<div>
						<h3 class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Já respondidas</h3>
						<div class="space-y-1.5">
							{#each answered as q (q.label)}
								<div class="rounded-md bg-surface-overlay px-3 py-2">
									<p class="text-[10px] text-text-faint">{q.label}</p>
									<p class="mt-0.5 text-[11px] text-text-secondary">{q.answer}</p>
								</div>
							{/each}
						</div>
					</div>
				{/if}

			{:else if job.status === 'READY_FOR_REVIEW'}
				{#if detail.questions.length > 0}
					<div class="mb-5 space-y-3">
						{#each detail.questions as q (q.label)}
							<label class="block">
								<span class="mb-1 block text-[11px] font-medium text-text-secondary">{q.label}</span>
								{#if q.options.length > 0}
									<select
										class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
										bind:value={answerInputs[q.label]}
									>
										<option value="">Selecione…</option>
										{#each q.options as opt (opt)}
											<option value={opt}>{opt}</option>
										{/each}
									</select>
								{:else}
									<input
										type={q.fieldType ?? 'text'}
										class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
										bind:value={answerInputs[q.label]}
									/>
								{/if}
							</label>
						{/each}
					</div>
				{/if}

				{#if appState.resumes.length > 0}
					<div>
						<label class="mb-1 block text-[11px] font-medium text-text-secondary" for="resume-select">
							Currículo
						</label>
						<select
							id="resume-select"
							class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
							bind:value={selectedResume}
						>
							<option value="">Padrão{appState.defaultResume ? ` (${appState.defaultResume})` : ''}</option>
							{#each appState.resumes as r (r)}
								<option value={r}>{r}</option>
							{/each}
						</select>
					</div>
				{/if}

			{:else if job.status === 'EXTERNAL'}
				{#if detail.applicationUrl}
					<a
						href={detail.applicationUrl}
						target="_blank"
						rel="noreferrer noopener"
						class="flex items-center gap-1.5 text-[12px] text-[#a855f7] hover:underline"
					>
						<ExternalLink size={12} aria-hidden="true" />
						Candidatar externamente
					</a>
				{:else}
					<p class="text-[12px] text-text-faint">Nenhum link externo disponível.</p>
				{/if}

			{:else if job.status === 'FAILED'}
				{#if detail.errorMessage}
					<div class="mb-3 rounded-md bg-[#1c0a0a] px-3 py-2 text-[11px] text-[#ef4444]">
						{detail.errorMessage}
					</div>
				{/if}
				<p class="text-[12px] text-text-muted">Esta candidatura falhou. Você pode ignorá-la.</p>

			{:else}
				<p class="text-[12px] text-text-faint">Nenhuma ação disponível.</p>
			{/if}
		{/if}
	</div>

	<!-- Rodapé -->
	{#if hasActions && detail}
		<div class="flex flex-shrink-0 items-center justify-between gap-3 border-t border-border-subtle px-4 py-3">
			<span class="text-[11px] text-text-faint">{notice}</span>
			<div class="flex gap-2">
				{#if ['FOUND', 'NEEDS_INPUT', 'READY_FOR_REVIEW', 'FAILED'].includes(job.status)}
					<button
						type="button"
						class="h-8 rounded-md border border-border-default bg-surface-overlay px-3 text-[12px] font-medium text-text-muted hover:border-border-strong hover:text-text-secondary focus-visible:outline-none disabled:opacity-40"
						disabled={busy}
						onclick={handleSkip}
					>
						Ignorar
					</button>
				{/if}

				{#if job.status === 'FOUND'}
					<button
						type="button"
						class="h-8 rounded-md bg-accent-500 px-3 text-[12px] font-medium text-white hover:bg-accent-600 focus-visible:outline-none disabled:opacity-40"
						disabled={busy}
						onclick={handleGetQuestions}
					>
						{busy ? 'Abrindo…' : 'Abrir formulário'}
					</button>
				{:else if job.status === 'NEEDS_INPUT'}
					<button
						type="button"
						class="h-8 rounded-md bg-accent-500 px-3 text-[12px] font-medium text-white hover:bg-accent-600 focus-visible:outline-none disabled:opacity-40"
						disabled={busy || !canSave}
						onclick={handleSaveAnswers}
					>
						Salvar respostas
					</button>
				{:else if job.status === 'READY_FOR_REVIEW'}
					<button
						type="button"
						class="h-8 rounded-md bg-accent-500 px-3 text-[12px] font-medium text-white hover:bg-accent-600 focus-visible:outline-none disabled:opacity-40"
						disabled={busy}
						onclick={handleApply}
					>
						{busy ? 'Enviando…' : 'Enviar candidatura'}
					</button>
				{/if}
			</div>
		</div>
	{/if}
</div>

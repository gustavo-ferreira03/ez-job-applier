<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import FileText from '@lucide/svelte/icons/file-text';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';
	import { onMount } from 'svelte';
	import * as api from '$lib/api';
	import type { ProviderInfo } from '$lib/api';
	import type { LlmSettings } from '$lib/types';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';
	import ProvidersModal from './ProvidersModal.svelte';

	let llm = $state<LlmSettings>({
		enabled: false,
		provider: 'anthropic',
		model: '',
		filterJobs: false,
		autoAnswer: false,
		externalApply: false,
		filterCriteria: ''
	});
	let configuredProviders = $state<ProviderInfo[]>([]);
	let providersModalOpen = $state(false);

	async function refreshLlmSettings() {
		try {
			const res = await api.getLlmSettings();
			llm = res.current;
			configuredProviders = res.providers.filter((p) => p.configured);
		} catch {
			toastState.show('Falha ao carregar configurações de IA', 'error');
		}
	}

	onMount(() => {
		refreshLlmSettings();
	});

	async function handleLlmSetting(update: Partial<LlmSettings>) {
		try {
			llm = await api.updateLlmSettings(update);
		} catch {
			toastState.show('Falha ao salvar configuração de IA', 'error');
		}
	}

	let filterCriteriaDebounce: ReturnType<typeof setTimeout> | null = null;

	function handleFilterCriteriaInput(value: string) {
		if (filterCriteriaDebounce !== null) clearTimeout(filterCriteriaDebounce);
		filterCriteriaDebounce = setTimeout(() => {
			handleLlmSetting({ filterCriteria: value });
		}, 600);
	}

	async function handleSetting(patch: Partial<typeof appState.settings>) {
		try {
			appState.settings = await api.updateAppSettings(patch);
		} catch {
			toastState.show('Falha ao salvar configuração', 'error');
		}
	}

	async function handleUpload(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const { filename } = await api.uploadResume(file);
			if (!appState.resumes.includes(filename)) appState.resumes = [...appState.resumes, filename];
			if (appState.resumes.length === 1) {
				await api.setDefaultResume(filename);
				appState.defaultResume = filename;
			}
			toastState.show(`Upload realizado: ${filename}`, 'success');
		} catch {
			toastState.show('Falha no upload', 'error');
		}
		(e.target as HTMLInputElement).value = '';
	}

	async function handleSetDefault(filename: string) {
		try {
			await api.setDefaultResume(filename);
			appState.defaultResume = filename;
			toastState.show('Currículo padrão atualizado', 'success');
		} catch {
			toastState.show('Falha ao definir padrão', 'error');
		}
	}

	async function handleDelete(filename: string) {
		try {
			await api.deleteResume(filename);
			appState.resumes = appState.resumes.filter((r) => r !== filename);
			if (appState.defaultResume === filename) appState.defaultResume = null;
			toastState.show(`${filename} removido`, 'success');
		} catch {
			toastState.show('Falha ao remover currículo', 'error');
		}
	}

	let clearConfirming = $state(false);

	async function handleClearDatabase() {
		if (!clearConfirming) { clearConfirming = true; return; }
		try {
			await api.clearDatabase();
			appState.jobs = [];
			appState.executions = [];
			clearConfirming = false;
			toastState.show('Banco de dados limpo', 'success');
		} catch {
			clearConfirming = false;
			toastState.show('Falha ao limpar banco de dados', 'error');
		}
	}
</script>

<div class="mx-auto max-w-xl p-6">
	<h2 class="mb-6 text-[15px] font-semibold text-text-primary">Configurações</h2>

	<!-- Automação -->
	<section class="mb-6">
		<h3 class="mb-3 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Automação</h3>
		<button
			type="button"
			class="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-left transition-colors duration-150 hover:border-border-default focus-visible:outline-none"
			onclick={() => handleSetting({ browserVisible: !appState.settings.browserVisible })}
		>
			<div class="flex items-center gap-3">
				{#if appState.settings.browserVisible}
					<Eye size={15} strokeWidth={1.75} class="text-accent-500 flex-shrink-0" aria-hidden="true" />
				{:else}
					<EyeOff size={15} strokeWidth={1.75} class="text-text-faint flex-shrink-0" aria-hidden="true" />
				{/if}
				<div>
					<p class="text-[12px] font-medium text-text-primary">Mostrar browser durante automação</p>
					<p class="text-[11px] text-text-faint">
						{appState.settings.browserVisible ? 'Janela visível' : 'Browser roda em background'}
					</p>
				</div>
			</div>
			<div
				class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150
					{appState.settings.browserVisible ? 'bg-accent-500' : 'bg-surface-overlay border border-border-default'}"
			>
				<span
					class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150
						{appState.settings.browserVisible ? 'left-[18px]' : 'left-[3px]'}"
				></span>
			</div>
		</button>
	</section>

	<!-- Idioma de busca -->
	<section class="mb-6">
		<h3 class="mb-1 text-[12px] font-medium text-text-primary">Idioma de busca</h3>
		<p class="mb-3 text-[11px] text-text-faint">Afeta quais vagas o LinkedIn retorna para suas palavras-chave</p>
		<div class="flex overflow-hidden rounded-lg border border-border-default">
			{#each [{ value: 'pt-BR', label: 'Português (BR)' }, { value: 'en-US', label: 'English (US)' }] as opt (opt.value)}
				<button
					type="button"
					class="flex-1 cursor-pointer px-3 py-2 text-[12px] font-medium transition-colors duration-100 focus-visible:outline-none
						{appState.settings.searchLocale === opt.value
							? 'bg-accent-500 text-surface-base'
							: 'bg-surface-overlay text-text-muted hover:bg-surface-hover'}"
					onclick={() => handleSetting({ searchLocale: opt.value as 'pt-BR' | 'en-US' })}
				>
					{opt.label}
				</button>
			{/each}
		</div>
	</section>

	<section class="mb-6">
		<h3 class="mb-3 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Inteligência Artificial</h3>

		<div class="mb-3 space-y-1.5">
			{#each configuredProviders as p (p.id)}
				<div class="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised px-3 py-2.5">
					<span class="min-w-0 flex-1 text-[12px] text-text-primary">{p.name}</span>
					<span class="text-[10px] font-bold text-[#22c55e]">CONFIGURADO</span>
				</div>
			{/each}
			{#if configuredProviders.length === 0}
				<p class="text-[11px] text-text-faint">Nenhum provedor configurado</p>
			{/if}
		</div>

		<button
			type="button"
			class="mb-4 h-8 cursor-pointer rounded-md border border-border-default bg-surface-overlay px-3.5 text-[12px] font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary focus-visible:outline-none"
			onclick={() => (providersModalOpen = true)}
		>
			Gerenciar provedores
		</button>

		<button
			type="button"
			class="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-left transition-colors duration-150 hover:border-border-default focus-visible:outline-none"
			onclick={() => handleLlmSetting({ enabled: !llm.enabled })}
		>
			<div>
				<p class="text-[12px] font-medium text-text-primary">Ativar IA</p>
				<p class="text-[11px] text-text-faint">
					{llm.enabled ? 'IA ativada' : 'IA desativada'}
				</p>
			</div>
			<div
				class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150
					{llm.enabled ? 'bg-accent-500' : 'bg-surface-overlay border border-border-default'}"
			>
				<span
					class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150
						{llm.enabled ? 'left-[18px]' : 'left-[3px]'}"
				></span>
			</div>
		</button>

		<div class="mt-2 {llm.enabled ? '' : 'opacity-50'} space-y-2 transition-opacity duration-150">
			{#each [
				{ key: 'filterJobs' as const, label: 'Filtrar vagas', desc: 'Descarta automaticamente vagas que não correspondem ao seu perfil' },
				{ key: 'autoAnswer' as const, label: 'Auto-responder perguntas', desc: 'Preenche automaticamente as respostas das perguntas da vaga' },
				{ key: 'externalApply' as const, label: 'Aplicar em vagas externas', desc: 'Usa um agente para preencher formulários de ATS externos' }
			] as feat (feat.key)}
				<button
					type="button"
					class="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-left transition-colors duration-150 hover:border-border-default focus-visible:outline-none"
					onclick={() => handleLlmSetting({ [feat.key]: !llm[feat.key] })}
				>
					<div>
						<p class="text-[12px] font-medium text-text-primary">{feat.label}</p>
						<p class="text-[11px] text-text-faint">{feat.desc}</p>
					</div>
					<div
						class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150
							{llm[feat.key] ? 'bg-accent-500' : 'bg-surface-overlay border border-border-default'}"
					>
						<span
							class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150
								{llm[feat.key] ? 'left-[18px]' : 'left-[3px]'}"
						></span>
					</div>
				</button>
			{/each}

			{#if llm.filterJobs}
				<div class="mt-2">
					<label for="llm-filter-criteria" class="mb-1 block text-[11px] font-medium text-text-secondary">
						Critérios de filtro
					</label>
					<textarea
						id="llm-filter-criteria"
						rows="3"
						placeholder="Ex: Apenas vagas remotas para desenvolvedores sênior com foco em TypeScript"
						value={llm.filterCriteria}
						oninput={(e) => handleFilterCriteriaInput((e.target as HTMLTextAreaElement).value)}
						class="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-2 text-[12px] text-text-primary placeholder:text-text-faint focus:border-accent-500 focus:outline-none resize-none"
					></textarea>
				</div>
			{/if}
		</div>
	</section>

	{#if providersModalOpen}
		<ProvidersModal onClose={() => { providersModalOpen = false; refreshLlmSettings(); }} />
	{/if}

	<!-- Currículos -->
	<section class="mb-6">
		<div class="mb-3 flex items-center justify-between">
			<h3 class="text-[10px] font-semibold uppercase tracking-wide text-text-faint">
				Currículos {#if appState.resumes.length > 0}<span class="normal-case font-normal">({appState.resumes.length})</span>{/if}
			</h3>
			<label class="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border-default bg-surface-overlay px-2.5 text-[11px] font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary">
				<Upload size={11} aria-hidden="true" />
				Upload PDF
				<input type="file" class="sr-only" accept=".pdf" onchange={handleUpload} />
			</label>
		</div>

		{#if appState.resumes.length === 0}
			<div class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-subtle py-10 text-center">
				<FileText size={24} strokeWidth={1.5} class="text-text-faint" aria-hidden="true" />
				<p class="text-[11px] text-text-faint">Nenhum currículo enviado</p>
			</div>
		{:else}
			<div class="space-y-1.5">
				{#each appState.resumes as filename (filename)}
					<div class="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised px-3 py-2.5">
						<FileText size={13} strokeWidth={1.75} class="flex-shrink-0 text-text-faint" aria-hidden="true" />
						<span class="min-w-0 flex-1 truncate text-[12px] text-text-primary">{filename}</span>
						<div class="flex flex-shrink-0 items-center gap-3">
							{#if appState.defaultResume === filename}
								<span class="text-[10px] font-bold text-[#22c55e]">PADRÃO</span>
							{:else}
								<button
									type="button"
									class="cursor-pointer text-[10px] font-medium text-text-faint transition-colors duration-150 hover:text-text-muted focus-visible:outline-none"
									onclick={() => handleSetDefault(filename)}
								>
									Definir padrão
								</button>
							{/if}
							<button
								type="button"
								class="cursor-pointer text-[10px] font-medium text-[#ef4444] transition-colors duration-150 hover:text-[#dc2626] focus-visible:outline-none"
								onclick={() => handleDelete(filename)}
							>
								Remover
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Zona de perigo -->
	<section>
		<h3 class="mb-3 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Zona de perigo</h3>
		<div class="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3">
			<div>
				<p class="text-[12px] font-medium text-text-primary">Limpar todos os dados</p>
				<p class="text-[11px] text-text-faint">Remove todas as vagas, candidaturas e descobertas. Currículos são mantidos.</p>
			</div>
			<button
				type="button"
				class="h-8 cursor-pointer flex-shrink-0 rounded-md border px-3 text-[12px] font-medium focus-visible:outline-none transition-colors
					{clearConfirming
						? 'border-[#ef4444] bg-[#1c0a0a] text-[#ef4444] hover:bg-[#2a0f0f]'
						: 'border-border-default bg-surface-overlay text-[#ef4444] hover:border-[#ef4444]'}"
				onclick={handleClearDatabase}
			>
				<Trash2 size={13} class="mr-1.5 inline-block" aria-hidden="true" />
				{clearConfirming ? 'Confirmar?' : 'Limpar'}
			</button>
		</div>
	</section>
</div>

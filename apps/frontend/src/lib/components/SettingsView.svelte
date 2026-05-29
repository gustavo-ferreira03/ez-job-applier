<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import FileText from '@lucide/svelte/icons/file-text';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';
	import * as api from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';

	async function handleSetting(patch: Partial<typeof appState.settings>) {
		try {
			appState.settings = await api.updateAppSettings(patch);
		} catch {
			toastState.show('Falha ao salvar configuração');
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
			toastState.show(`Upload realizado: ${filename}`);
		} catch {
			toastState.show('Falha no upload');
		}
		(e.target as HTMLInputElement).value = '';
	}

	async function handleSetDefault(filename: string) {
		try {
			await api.setDefaultResume(filename);
			appState.defaultResume = filename;
			toastState.show('Currículo padrão atualizado');
		} catch {
			toastState.show('Falha ao definir padrão');
		}
	}

	async function handleDelete(filename: string) {
		try {
			await api.deleteResume(filename);
			appState.resumes = appState.resumes.filter((r) => r !== filename);
			if (appState.defaultResume === filename) appState.defaultResume = null;
			toastState.show(`${filename} removido`);
		} catch {
			toastState.show('Falha ao remover currículo');
		}
	}

	let clearConfirming = $state(false);

	async function handleClearDatabase() {
		if (!clearConfirming) { clearConfirming = true; return; }
		try {
			await api.clearDatabase();
			appState.jobs = [];
			appState.discoveries = [];
			clearConfirming = false;
			toastState.show('Banco de dados limpo');
		} catch {
			clearConfirming = false;
			toastState.show('Falha ao limpar banco de dados');
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
			class="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-left hover:border-border-default focus-visible:outline-none"
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
					class="flex-1 px-3 py-2 text-[12px] font-medium transition-colors duration-100 focus-visible:outline-none
						{appState.settings.searchLocale === opt.value
							? 'bg-accent-500 text-white'
							: 'bg-surface-overlay text-text-muted hover:bg-surface-hover'}"
					onclick={() => handleSetting({ searchLocale: opt.value as 'pt-BR' | 'en-US' })}
				>
					{opt.label}
				</button>
			{/each}
		</div>
	</section>

	<!-- Currículos -->
	<section class="mb-6">
		<div class="mb-3 flex items-center justify-between">
			<h3 class="text-[10px] font-semibold uppercase tracking-wide text-text-faint">
				Currículos {#if appState.resumes.length > 0}<span class="normal-case font-normal">({appState.resumes.length})</span>{/if}
			</h3>
			<label class="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border-default bg-surface-overlay px-2.5 text-[11px] font-medium text-text-muted hover:border-border-strong hover:text-text-secondary">
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
									class="text-[10px] font-medium text-text-faint hover:text-text-muted focus-visible:outline-none"
									onclick={() => handleSetDefault(filename)}
								>
									Definir padrão
								</button>
							{/if}
							<button
								type="button"
								class="text-[10px] font-medium text-[#ef4444] hover:text-[#dc2626] focus-visible:outline-none"
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
				class="h-8 flex-shrink-0 rounded-md border px-3 text-[12px] font-medium focus-visible:outline-none transition-colors
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

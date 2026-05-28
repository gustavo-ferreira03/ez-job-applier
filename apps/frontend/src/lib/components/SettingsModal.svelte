<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import FileText from '@lucide/svelte/icons/file-text';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';
	import X from '@lucide/svelte/icons/x';
	import * as api from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	async function handleSetting(patch: Partial<typeof appState.settings>) {
		try {
			const updated = await api.updateAppSettings(patch);
			appState.settings = updated;
		} catch {
			toastState.show('Failed to update settings');
		}
	}

	function handleBrowserVisibleToggle() {
		handleSetting({ browserVisible: !appState.settings.browserVisible });
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
			toastState.show(`Uploaded: ${filename}`);
		} catch {
			toastState.show('Failed to upload resume');
		}
		(e.target as HTMLInputElement).value = '';
	}

	async function handleSetDefault(filename: string) {
		try {
			await api.setDefaultResume(filename);
			appState.defaultResume = filename;
			toastState.show('Default resume updated');
		} catch {
			toastState.show('Failed to set default');
		}
	}

	async function handleDelete(filename: string) {
		try {
			await api.deleteResume(filename);
			appState.resumes = appState.resumes.filter((r) => r !== filename);
			if (appState.defaultResume === filename) appState.defaultResume = null;
			toastState.show(`Deleted ${filename}`);
		} catch {
			toastState.show('Failed to delete resume');
		}
	}

	let clearConfirming = $state(false);

	async function handleClearDatabase() {
		if (!clearConfirming) {
			clearConfirming = true;
			return;
		}
		try {
			await api.clearDatabase();
			appState.jobs = [];
			clearConfirming = false;
			toastState.show('Database cleared');
		} catch {
			clearConfirming = false;
			toastState.show('Failed to clear database');
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="z-modal fixed inset-0 flex items-start justify-center bg-black/72 p-4">
	<button
		class="absolute inset-0 cursor-default border-0 bg-transparent"
		type="button"
		aria-label="Close"
		onclick={onClose}
	></button>

	<div
		class="relative z-10 mt-12 flex max-h-[calc(100vh-96px)] w-[min(440px,100%)] flex-col border border-border-default bg-surface-raised shadow-lg"
		role="dialog"
		aria-modal="true"
		aria-label="Settings"
	>
		<!-- Header -->
		<div class="flex min-h-14 flex-shrink-0 items-center justify-between border-b border-border-subtle px-5">
			<h2 class="text-sm font-bold text-text-primary">Settings</h2>
			<button
				class="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center border border-border-default bg-surface-overlay p-0 text-[#4a6a88] hover:border-border-strong hover:text-[#7aaac8] focus-visible:outline-0"
				type="button"
				aria-label="Close"
				onclick={onClose}
			>
				<X size={16} strokeWidth={2.25} aria-hidden="true" />
			</button>
		</div>

		<!-- Body -->
		<div class="flex-1 space-y-6 overflow-y-auto p-5">
			<!-- Browser -->
			<div>
				<p class="mb-3 text-xs font-bold uppercase tracking-wide text-text-secondary">Automation</p>
				<button
					class="flex w-full cursor-pointer items-center justify-between gap-4 border border-border-subtle bg-surface-overlay px-4 py-3 text-left transition-colors duration-100 hover:border-border-default focus-visible:outline-0"
					type="button"
					onclick={handleBrowserVisibleToggle}
				>
					<div class="flex items-center gap-3">
						{#if appState.settings.browserVisible}
							<Eye size={16} strokeWidth={1.75} class="shrink-0 text-brand-500" aria-hidden="true" />
						{:else}
							<EyeOff size={16} strokeWidth={1.75} class="shrink-0 text-text-muted" aria-hidden="true" />
						{/if}
						<div>
							<p class="text-sm font-medium text-text-primary">Show browser window</p>
							<p class="text-xs text-text-muted">
								{#if appState.settings.browserVisible}
									Browser window is visible during automation
								{:else}
									Browser runs hidden in the background
								{/if}
							</p>
						</div>
					</div>
					<div
						class="relative inline-flex h-5 w-9 shrink-0 items-center {appState.settings.browserVisible ? 'bg-brand-500' : 'bg-surface-raised border border-border-default'} transition-colors duration-150"
					>
						<span
							class="absolute h-3.5 w-3.5 bg-white transition-all duration-150 {appState.settings.browserVisible ? 'left-[18px]' : 'left-[3px]'}"
						></span>
					</div>
				</button>
			</div>

			<!-- Search locale -->
			<div>
				<p class="mb-1 text-sm font-medium text-text-primary">Search language</p>
				<p class="mb-3 text-xs text-text-muted">Affects which job listings LinkedIn returns for your keywords</p>
				<div class="flex gap-0">
					{#each [{ value: 'pt-BR', label: 'Português (BR)' }, { value: 'en-US', label: 'English (US)' }] as opt (opt.value)}
						<button
							class="flex-1 border px-3 py-2 text-[13px] font-bold transition-colors duration-100 focus-visible:outline-0
								{appState.settings.searchLocale === opt.value
									? 'border-brand-500 bg-brand-500/15 text-brand-400 z-10'
									: 'border-border-default bg-surface-overlay text-text-muted hover:border-border-strong hover:text-text-secondary -ml-px first:ml-0'}"
							type="button"
							onclick={() => handleSetting({ searchLocale: opt.value as 'pt-BR' | 'en-US' })}
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Danger zone -->
			<div>
				<p class="mb-3 text-xs font-bold uppercase tracking-wide text-text-secondary">Danger zone</p>
				<div class="flex items-center justify-between gap-4 border border-border-subtle bg-surface-overlay px-4 py-3">
					<div>
						<p class="text-sm font-medium text-text-primary">Clear all data</p>
						<p class="text-xs text-text-muted">Removes all jobs, applications and discoveries. Resumes are kept.</p>
					</div>
					<button
						class="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-2 border px-4 text-[13px] font-bold focus-visible:outline-0
							{clearConfirming
								? 'border-danger-500 bg-danger-500/10 text-danger-500 hover:bg-danger-500/20'
								: 'border-border-default bg-surface-overlay text-danger-500 hover:border-danger-500'}"
						type="button"
						onclick={handleClearDatabase}
					>
						<Trash2 size={14} aria-hidden="true" />
						{clearConfirming ? 'Confirm?' : 'Clear'}
					</button>
				</div>
			</div>

			<!-- Resumes -->
			<div>
				<div class="mb-3 flex items-center justify-between">
					<p class="text-xs font-bold uppercase tracking-wide text-text-secondary">
						Resumes {#if appState.resumes.length > 0}<span class="normal-case font-normal text-text-muted">({appState.resumes.length})</span>{/if}
					</p>
					<label class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 border border-border-default bg-surface-overlay px-3 text-xs font-bold text-text-secondary hover:border-border-strong hover:text-text-primary">
						<Upload size={12} aria-hidden="true" />
						Upload PDF
						<input type="file" class="sr-only" accept=".pdf" onchange={handleUpload} />
					</label>
				</div>

				{#if appState.resumes.length === 0}
					<div class="flex flex-col items-center gap-2 py-8 text-center">
						<FileText size={28} strokeWidth={1.5} class="text-text-faint" aria-hidden="true" />
						<p class="text-xs text-text-muted">No resumes uploaded yet</p>
					</div>
				{:else}
					<div class="space-y-1.5">
						{#each appState.resumes as filename (filename)}
							<div class="flex items-center gap-3 border border-border-subtle bg-surface-overlay px-3 py-2.5">
								<FileText size={14} strokeWidth={1.75} class="shrink-0 text-text-muted" aria-hidden="true" />
								<span class="min-w-0 flex-1 truncate text-sm text-text-primary">{filename}</span>
								<div class="flex shrink-0 items-center gap-3">
									{#if appState.defaultResume === filename}
										<span class="text-[11px] font-bold text-success-500">DEFAULT</span>
									{:else}
										<button
											class="text-[11px] font-bold text-text-muted hover:text-text-secondary focus-visible:outline-0"
											type="button"
											onclick={() => handleSetDefault(filename)}
										>
											Set default
										</button>
									{/if}
									<button
										class="text-[11px] font-bold text-danger-500 hover:text-danger-600 focus-visible:outline-0"
										type="button"
										onclick={() => handleDelete(filename)}
									>
										Delete
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Footer -->
		<div class="flex flex-shrink-0 justify-end border-t border-border-subtle px-5 py-4">
			<button
				class="inline-flex min-h-9 cursor-pointer items-center justify-center border border-border-default bg-surface-overlay px-4 text-[13px] font-bold text-text-secondary hover:border-border-strong hover:text-text-primary focus-visible:outline-0"
				type="button"
				onclick={onClose}
			>
				Done
			</button>
		</div>
	</div>
</div>

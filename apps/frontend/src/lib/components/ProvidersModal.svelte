<script lang="ts">
	import { fly } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { modalTransition } from '$lib/transitions';
	import X from '@lucide/svelte/icons/x';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import * as api from '$lib/api';
	import type { ProviderInfo, LlmSettingsResponse } from '$lib/api';
	import type { LlmSettings } from '$lib/types';
	import { toastState } from '$lib/toast.svelte';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let providers = $state<ProviderInfo[]>([]);
	let current = $state<LlmSettings>({
		enabled: false,
		provider: 'anthropic',
		model: '',
		filterJobs: false,
		autoAnswer: false,
		externalApply: false,
		filterCriteria: ''
	});
	let search = $state('');
	let expandedProvider = $state<string | null>(null);
	let apiKeyInput = $state('');
	let authTab = $state<'api_key' | 'oauth'>('api_key');
	let oauthState = $state<{
		sessionId?: string;
		type?: string;
		url?: string;
		userCode?: string;
		verificationUri?: string;
		status: string;
		error?: string;
	} | null>(null);
	let oauthPollInterval: ReturnType<typeof setInterval> | null = null;

	async function refreshProviders() {
		try {
			const res: LlmSettingsResponse = await api.getLlmSettings();
			providers = res.providers;
			current = res.current;
		} catch {
			toastState.show('Falha ao carregar provedores', 'error');
		}
	}

	function stopOAuthPolling() {
		if (oauthPollInterval !== null) {
			clearInterval(oauthPollInterval);
			oauthPollInterval = null;
		}
	}

	function resetTransientState() {
		stopOAuthPolling();
		oauthState = null;
		apiKeyInput = '';
		authTab = 'api_key';
	}

	function toggleProvider(id: string) {
		if (expandedProvider === id) {
			resetTransientState();
			expandedProvider = null;
		} else {
			resetTransientState();
			expandedProvider = id;
		}
	}

	async function handleSaveApiKey(providerId: string) {
		if (!apiKeyInput.trim()) return;
		try {
			await api.setProviderApiKey(providerId, apiKeyInput);
			apiKeyInput = '';
			await refreshProviders();
			toastState.show('Chave de API salva', 'success');
		} catch {
			toastState.show('Falha ao salvar chave de API', 'error');
		}
	}

	async function handleRemoveApiKey(providerId: string) {
		try {
			await api.removeProviderApiKey(providerId);
			await refreshProviders();
			toastState.show('Chave de API removida', 'success');
		} catch {
			toastState.show('Falha ao remover chave de API', 'error');
		}
	}

	async function handleStartOAuth(providerId: string) {
		try {
			stopOAuthPolling();
			oauthState = { status: 'pending' };
			const res = await api.startOAuth(providerId);
			oauthState = { sessionId: res.sessionId, type: res.type, status: 'pending' };

			oauthPollInterval = setInterval(async () => {
				if (!oauthState?.sessionId) { stopOAuthPolling(); return; }
				try {
					const poll = await api.pollOAuth(providerId, oauthState.sessionId);
					if (poll.status === 'done') {
						stopOAuthPolling();
						oauthState = { ...oauthState, status: 'done' };
						await refreshProviders();
						toastState.show('Autenticação concluída', 'success');
					} else if (poll.status === 'error') {
						stopOAuthPolling();
						oauthState = { ...oauthState, status: 'error', error: poll.error };
					} else {
						oauthState = {
							...oauthState,
							status: poll.status,
							url: poll.url ?? oauthState.url,
							userCode: poll.userCode ?? oauthState.userCode,
							verificationUri: poll.verificationUri ?? oauthState.verificationUri
						};
					}
				} catch {
					stopOAuthPolling();
					oauthState = { ...oauthState, status: 'error' };
				}
			}, 2000);
		} catch {
			oauthState = null;
			toastState.show('Falha ao iniciar autenticação', 'error');
		}
	}

	async function handleModelChange(providerId: string, model: string) {
		try {
			current = await api.updateLlmSettings({ provider: providerId, model });
		} catch {
			toastState.show('Falha ao atualizar modelo', 'error');
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	const filteredProviders = $derived(
		providers
			.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
			.sort((a, b) => {
				if (a.configured === b.configured) return a.name.localeCompare(b.name);
				return a.configured ? -1 : 1;
			})
	);

	onMount(() => {
		refreshProviders();
		return () => stopOAuthPolling();
	});
</script>

<svelte:window onkeydown={onKeydown} />

<div class="fixed inset-0 z-modal flex items-start justify-center bg-black/70 p-4">
	<button class="absolute inset-0 cursor-default" type="button" aria-label="Fechar" onclick={onClose}></button>

	<div
		class="relative z-10 mt-12 flex max-h-[calc(100vh-96px)] w-[min(520px,100%)] flex-col rounded-lg border border-border-default bg-surface-raised shadow-[var(--shadow-modal)]"
		role="dialog"
		aria-modal="true"
		aria-label="Provedores de IA"
		tabindex="-1"
		transition:fly={modalTransition}
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<div class="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-5 py-4">
			<h2 class="text-[13px] font-semibold text-text-primary">Provedores de IA</h2>
			<button
				type="button"
				class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-faint transition-colors duration-150 hover:bg-surface-overlay hover:text-text-muted focus-visible:outline-none"
				onclick={onClose}
				aria-label="Fechar"
			>
				<X size={14} />
			</button>
		</div>

		<div class="flex-1 overflow-y-auto p-5">
			<div class="mb-4">
				<label for="provider-search" class="sr-only">Buscar provedor</label>
				<input
					id="provider-search"
					type="text"
					placeholder="Buscar provedor..."
					bind:value={search}
					class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-3 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
				/>
			</div>

			<div class="space-y-1.5">
				{#each filteredProviders as provider (provider.id)}
					<div class="rounded-lg border border-border-subtle bg-surface-base overflow-hidden">
						<button
							type="button"
							class="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-overlay focus-visible:outline-none"
							onclick={() => toggleProvider(provider.id)}
						>
							<span class="min-w-0 flex-1 text-[12px] font-medium text-text-primary">{provider.name}</span>
							<div class="flex flex-shrink-0 items-center gap-2">
								{#if provider.authMethods.includes('oauth')}
									<span class="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-surface-overlay text-text-faint">Assinatura</span>
								{/if}
								{#if provider.configured}
									<span class="text-[10px] font-bold text-[#22c55e]">CONFIGURADO</span>
								{/if}
								{#if expandedProvider === provider.id}
									<ChevronDown size={13} class="text-text-faint" aria-hidden="true" />
								{:else}
									<ChevronRight size={13} class="text-text-faint" aria-hidden="true" />
								{/if}
							</div>
						</button>

						{#if expandedProvider === provider.id}
							<div class="border-t border-border-subtle px-3 pb-3 pt-3 space-y-3">
								{#if provider.authMethods.includes('oauth')}
									<div>
										<div class="flex overflow-hidden rounded-md border border-border-default mb-3">
											{#each [{ id: 'api_key', label: 'API Key' }, { id: 'oauth', label: 'Assinatura' }] as tab (tab.id)}
												<button
													type="button"
													class="flex-1 cursor-pointer px-3 py-1.5 text-[11px] font-medium transition-colors duration-100 focus-visible:outline-none
														{authTab === tab.id
															? 'bg-accent-500 text-surface-base'
															: 'bg-surface-overlay text-text-muted hover:bg-surface-hover'}"
													onclick={() => { authTab = tab.id as 'api_key' | 'oauth'; }}
												>
													{tab.label}
												</button>
											{/each}
										</div>

										{#if authTab === 'api_key'}
											<div class="space-y-2">
												<label for="pk-{provider.id}" class="block text-[11px] font-medium text-text-secondary">Chave de API</label>
												<div class="flex items-center gap-2">
													<input
														id="pk-{provider.id}"
														type="password"
														placeholder="sk-..."
														bind:value={apiKeyInput}
														class="flex-1 rounded-md border border-border-default bg-surface-overlay px-3 py-1.5 text-[12px] text-text-primary placeholder:text-text-faint focus:border-accent-500 focus:outline-none"
													/>
													<button
														type="button"
														class="h-8 cursor-pointer rounded-md border border-border-default bg-surface-overlay px-3 text-[11px] font-medium text-text-secondary transition-colors hover:border-accent-500 hover:text-accent-500 focus-visible:outline-none"
														onclick={() => handleSaveApiKey(provider.id)}
													>
														Salvar
													</button>
												</div>
												{#if provider.configured}
													<div class="flex items-center justify-between">
														<span class="text-[10px] font-bold text-[#22c55e]">CONFIGURADA</span>
														<button
															type="button"
															class="cursor-pointer text-[10px] font-medium text-[#ef4444] transition-colors hover:text-[#dc2626] focus-visible:outline-none"
															onclick={() => handleRemoveApiKey(provider.id)}
														>
															Remover
														</button>
													</div>
												{/if}
											</div>
										{:else}
											<div class="space-y-2">
												{#if !oauthState || oauthState.status === 'error'}
													<button
														type="button"
														class="h-8 cursor-pointer rounded-md border border-border-default bg-surface-overlay px-3 text-[11px] font-medium text-text-secondary transition-colors hover:border-accent-500 hover:text-accent-500 focus-visible:outline-none"
														onclick={() => handleStartOAuth(provider.id)}
													>
														Conectar
													</button>
													{#if oauthState?.status === 'error'}
														<p class="text-[11px] text-[#ef4444]">{oauthState.error ?? 'Erro na autenticação'}</p>
													{/if}
												{:else if oauthState.status === 'done'}
													<span class="text-[10px] font-bold text-[#22c55e]">CONECTADA</span>
												{:else if oauthState.type === 'browser'}
													<p class="text-[11px] text-text-faint">Aguardando autorização no navegador…</p>
													{#if oauthState.url}
														<a
															href={oauthState.url}
															target="_blank"
															rel="noopener noreferrer"
															class="text-[11px] font-medium text-accent-500 hover:underline"
														>
															Abrir no navegador
														</a>
													{/if}
												{:else if oauthState.type === 'device_code'}
													{#if oauthState.userCode}
														<p class="font-mono text-[16px] font-bold tracking-widest text-text-primary">{oauthState.userCode}</p>
													{/if}
													{#if oauthState.verificationUri}
														<a
															href={oauthState.verificationUri}
															target="_blank"
															rel="noopener noreferrer"
															class="text-[11px] font-medium text-accent-500 hover:underline"
														>
															{oauthState.verificationUri}
														</a>
													{/if}
													<p class="text-[11px] text-text-faint">Acesse o link e insira o código</p>
												{:else}
													<p class="text-[11px] text-text-faint">Aguardando…</p>
												{/if}
											</div>
										{/if}
									</div>
								{:else}
									<div class="space-y-2">
										<label for="pk-{provider.id}" class="block text-[11px] font-medium text-text-secondary">Chave de API</label>
										<div class="flex items-center gap-2">
											<input
												id="pk-{provider.id}"
												type="password"
												placeholder="sk-..."
												bind:value={apiKeyInput}
												class="flex-1 rounded-md border border-border-default bg-surface-overlay px-3 py-1.5 text-[12px] text-text-primary placeholder:text-text-faint focus:border-accent-500 focus:outline-none"
											/>
											<button
												type="button"
												class="h-8 cursor-pointer rounded-md border border-border-default bg-surface-overlay px-3 text-[11px] font-medium text-text-secondary transition-colors hover:border-accent-500 hover:text-accent-500 focus-visible:outline-none"
												onclick={() => handleSaveApiKey(provider.id)}
											>
												Salvar
											</button>
										</div>
										{#if provider.configured}
											<div class="flex items-center justify-between">
												<span class="text-[10px] font-bold text-[#22c55e]">CONFIGURADA</span>
												<button
													type="button"
													class="cursor-pointer text-[10px] font-medium text-[#ef4444] transition-colors hover:text-[#dc2626] focus-visible:outline-none"
													onclick={() => handleRemoveApiKey(provider.id)}
												>
													Remover
												</button>
											</div>
										{/if}
									</div>
								{/if}

								{#if provider.configured}
									<div>
										<label for="model-{provider.id}" class="mb-1.5 block text-[11px] font-medium text-text-secondary">Modelo padrão</label>
										<select
											id="model-{provider.id}"
											class="w-full rounded-md border border-border-default bg-surface-overlay px-3 py-1.5 text-[12px] text-text-primary focus:border-accent-500 focus:outline-none"
											value={current.provider === provider.id ? current.model : provider.models[0]?.id ?? ''}
											onchange={(e) => handleModelChange(provider.id, (e.target as HTMLSelectElement).value)}
										>
											{#each provider.models as model (model.id)}
												<option value={model.id}>{model.label}</option>
											{/each}
										</select>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/each}

				{#if filteredProviders.length === 0}
					<p class="text-center text-[11px] text-text-faint py-6">Nenhum provedor encontrado</p>
				{/if}
			</div>
		</div>
	</div>
</div>

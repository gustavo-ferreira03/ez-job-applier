<script lang="ts">
	import { cancelDiscovery } from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';
	import type { DiscoveryJob } from '$lib/types';

	interface Props {
		onStartNew: () => void;
	}

	let { onStartNew }: Props = $props();

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
	}

	function formatDuration(start: string, end: string | null): string {
		if (!end) return '';
		const ms = new Date(end).getTime() - new Date(start).getTime();
		const s = Math.floor(ms / 1000);
		const m = Math.floor(s / 60);
		return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
	}

	function configSummary(d: DiscoveryJob): string {
		const parts: string[] = [];
		const cfg = d.config;
		if (cfg.keywords) parts.push(cfg.keywords.split('\n').join(', '));
		if (cfg.location) parts.push(cfg.location);
		if (cfg.workType) {
			const map: Record<string, string> = { remote: 'Remoto', hybrid: 'Híbrido', onsite: 'Presencial' };
			parts.push(map[cfg.workType] ?? cfg.workType);
		}
		if (cfg.options?.easyApply) parts.push('Easy Apply');
		return parts.join(' · ') || 'LinkedIn';
	}

	async function handleCancel(d: DiscoveryJob) {
		try {
			await cancelDiscovery(d.id);
			appState.stopPolling();
			appState.activeDiscovery = null;
			appState.discoveries = appState.discoveries.map((x) =>
				x.id === d.id ? { ...x, status: 'cancelled' } : x
			);
			toastState.show('Descoberta cancelada');
		} catch {
			toastState.show('Falha ao cancelar');
		}
	}

	function handleRepeat(d: DiscoveryJob) {
		appState.discoverConfig = { ...d.config };
		onStartNew();
	}

	const statusLabel: Record<DiscoveryJob['status'], string> = {
		running: 'Em andamento',
		done: 'Concluída',
		failed: 'Falhou',
		cancelled: 'Cancelada'
	};

	const statusClass: Record<DiscoveryJob['status'], string> = {
		running: 'bg-[#2d2508] text-[#ca8a04]',
		done: 'bg-[#052e16] text-[#22c55e]',
		failed: 'bg-[#1c0a0a] text-[#ef4444]',
		cancelled: 'bg-[#1c1c20] text-[#52525b]'
	};
</script>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-4 py-3">
		<div>
			<h2 class="text-[13px] font-semibold text-text-primary">Discoveries</h2>
			<p class="text-[11px] text-text-faint">{appState.discoveries.length} buscas realizadas</p>
		</div>
		<button
			type="button"
			class="h-8 rounded-md bg-accent-500 px-3 text-[12px] font-medium text-white hover:bg-accent-600 focus-visible:outline-none"
			onclick={onStartNew}
		>
			Nova busca
		</button>
	</div>

	<!-- Lista -->
	<div class="flex-1 overflow-y-auto p-4">
		{#if appState.discoveries.length === 0}
			<div class="py-16 text-center text-[12px] text-text-faint">
				Nenhuma descoberta realizada ainda.
			</div>
		{:else}
			<div class="space-y-2">
				{#each appState.discoveries as d (d.id)}
					<div
						class="rounded-lg border bg-surface-raised px-4 py-3
							{d.status === 'running' ? 'border-[#2a2208]' : d.status === 'failed' ? 'border-[#2a1010]' : 'border-border-subtle'}"
					>
						<div class="mb-2 flex items-center justify-between gap-3">
							<div class="flex items-center gap-2">
								<span class="rounded-sm bg-[#1e3a5f] px-1.5 py-0.5 text-[10px] font-semibold text-[#3b82f6]">LinkedIn</span>
								<span class="rounded-sm px-1.5 py-0.5 text-[10px] font-medium {statusClass[d.status]}">
									{#if d.status === 'running'}
										<span class="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#ca8a04]"></span>
									{/if}
									{statusLabel[d.status]}
								</span>
							</div>

							<div class="flex items-center gap-2">
								{#if d.status === 'running'}
									<span class="text-[11px] text-text-faint">{d.discovered} encontradas</span>
									<button
										type="button"
										class="h-6 rounded-md border border-border-default bg-surface-overlay px-2.5 text-[11px] text-text-muted hover:border-border-strong focus-visible:outline-none"
										onclick={() => handleCancel(d)}
									>
										Cancelar
									</button>
								{:else}
									<span class="text-[12px] font-semibold text-text-secondary">{d.discovered} vagas</span>
									<button
										type="button"
										class="h-6 rounded-md border border-border-default bg-surface-overlay px-2.5 text-[11px] text-text-muted hover:border-border-strong focus-visible:outline-none"
										onclick={() => handleRepeat(d)}
									>
										Repetir
									</button>
								{/if}
							</div>
						</div>

						<p class="text-[11px] text-text-muted">{configSummary(d)}</p>

						<div class="mt-1 flex items-center gap-3 text-[10px] text-text-faint">
							{#if d.status === 'failed' && d.errorMessage}
								<span class="text-[#ef4444]">{d.errorMessage}</span>
							{/if}
							<span>{formatDate(d.startedAt)}</span>
							{#if d.finishedAt}
								<span>· {formatDuration(d.startedAt, d.finishedAt)}</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

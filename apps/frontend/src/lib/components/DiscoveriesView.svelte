<script lang="ts">
	import { appState } from '$lib/state.svelte';
	import type { Execution } from '$lib/types';

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
	}

	function formatDuration(start: string, end: string | null): string {
		if (!end) return '';
		const ms = new Date(end).getTime() - new Date(start).getTime();
		const s = Math.floor(ms / 1000);
		const m = Math.floor(s / 60);
		return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
	}

	function configSummary(e: Execution): string {
		const parts: string[] = [];
		const cfg = e.config;
		if (cfg.keywords) parts.push(cfg.keywords.split('\n').join(', '));
		if (cfg.location) parts.push(cfg.location);
		if (cfg.workType) {
			const map: Record<string, string> = { remote: 'Remoto', hybrid: 'Híbrido', onsite: 'Presencial' };
			parts.push(map[cfg.workType] ?? cfg.workType);
		}
		if (cfg.options?.easyApply) parts.push('Easy Apply');
		return parts.join(' · ') || 'LinkedIn';
	}

	const statusLabel: Record<Execution['status'], string> = {
		running: 'Rodando',
		waiting: 'Aguardando',
		paused: 'Pausada',
		done: 'Concluída',
		failed: 'Falhou',
		cancelled: 'Cancelada'
	};

	const statusClass: Record<Execution['status'], string> = {
		running: 'bg-execution-bg text-execution-text',
		waiting: 'bg-surface-overlay text-text-muted',
		paused: 'bg-status-input-bg text-status-input-text',
		done: 'bg-status-submitted-bg text-status-submitted-text',
		failed: 'bg-danger-bg text-danger-500',
		cancelled: 'bg-surface-overlay text-text-faint'
	};
</script>

<div class="flex h-full flex-col">
	<!-- Header -->
	<div class="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-4 py-3">
		<div>
			<h2 class="text-sm font-semibold text-text-primary">Histórico de execuções</h2>
			<p class="text-[13px] text-text-muted">{appState.executions.length} execuções</p>
		</div>
	</div>

	<!-- List -->
	<div class="flex-1 overflow-y-auto p-4">
		{#if appState.executions.length === 0}
			<p class="text-[13px] text-text-faint">Nenhuma execução ainda. Inicie uma pelo botão na barra lateral.</p>
		{:else}
			<div class="space-y-2">
				{#each appState.executions as ex (ex.id)}
					<div class="rounded-md border border-border-subtle bg-surface-raised p-3">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<p class="truncate text-[13px] font-medium text-text-primary">{configSummary(ex)}</p>
								<p class="mt-0.5 text-xs text-text-muted">
									{formatDate(ex.startedAt)}
									{#if ex.finishedAt} · {formatDuration(ex.startedAt, ex.finishedAt)}{/if}
									· {ex.discovered} vagas
								</p>
								{#if ex.errorMessage}
									<p class="mt-1 text-xs text-danger-500">{ex.errorMessage}</p>
								{/if}
							</div>
							<span class="shrink-0 rounded-sm px-2 py-0.5 text-xs font-medium {statusClass[ex.status]}">
								{statusLabel[ex.status]}
							</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

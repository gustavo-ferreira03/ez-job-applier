<script lang="ts">
	import { fly } from 'svelte/transition';
	import X from '@lucide/svelte/icons/x';
	import * as api from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';
	import type { DiscoverConfig } from '$lib/types';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let keywords = $state(appState.discoverConfig.keywords ?? '');
	let location = $state(appState.discoverConfig.location ?? '');
	let maxJobs = $state(appState.discoverConfig.maxJobs?.toString() ?? '');
	let workType = $state(appState.discoverConfig.workType ?? '');
	let datePosted = $state(appState.discoverConfig.datePosted ?? '');
	let experienceLevel = $state<string[]>([...(appState.discoverConfig.experienceLevel ?? [])]);
	let jobType = $state<string[]>([...(appState.discoverConfig.jobType ?? [])]);
	let easyApply = $state((appState.discoverConfig.options?.easyApply as boolean) ?? true);
	let busy = $state(false);

	const WORK_TYPES = [
		{ value: '', label: 'Qualquer' },
		{ value: 'remote', label: 'Remoto' },
		{ value: 'hybrid', label: 'Híbrido' },
		{ value: 'onsite', label: 'Presencial' }
	];

	const DATE_POSTED = [
		{ value: '', label: 'Qualquer período' },
		{ value: 'day', label: 'Últimas 24h' },
		{ value: 'week', label: 'Última semana' },
		{ value: 'month', label: 'Último mês' }
	];

	const EXP_LEVELS = [
		{ value: 'entry', label: 'Júnior' },
		{ value: 'associate', label: 'Associate' },
		{ value: 'mid_senior', label: 'Pleno/Sênior' },
		{ value: 'director', label: 'Diretor' },
		{ value: 'executive', label: 'Executivo' }
	];

	const JOB_TYPES = [
		{ value: 'full_time', label: 'CLT' },
		{ value: 'part_time', label: 'Part-time' },
		{ value: 'contract', label: 'PJ/Contrato' },
		{ value: 'temporary', label: 'Temporário' },
		{ value: 'internship', label: 'Estágio' }
	];

	function toggle(arr: string[], val: string): string[] {
		return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	async function handleStart() {
		if (busy) return;
		busy = true;
		try {
			const config: DiscoverConfig = {
				provider: 'linkedin',
				keywords: keywords.trim() || undefined,
				location: location.trim() || undefined,
				workType: workType || undefined,
				datePosted: datePosted || undefined,
				experienceLevel: experienceLevel.length ? experienceLevel : undefined,
				jobType: jobType.length ? jobType : undefined,
				maxJobs: maxJobs ? parseInt(maxJobs, 10) : undefined,
				options: { easyApply }
			};
			const discovery = await api.startDiscovery(config);
			appState.discoverConfig = config;
			appState.activeDiscovery = discovery;
			appState.discoveries = [discovery, ...appState.discoveries];
			appState.startPolling(discovery.id);
			toastState.show('Descoberta iniciada');
			onClose();
		} catch {
			toastState.show('Falha ao iniciar descoberta');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Overlay -->
<div class="fixed inset-0 z-modal flex items-start justify-center bg-black/70 p-4">
	<button
		class="absolute inset-0 cursor-default"
		type="button"
		aria-label="Fechar"
		onclick={onClose}
	></button>

	<div
		class="relative z-10 mt-12 flex max-h-[calc(100vh-96px)] w-[min(480px,100%)] flex-col rounded-lg border border-border-default bg-surface-raised shadow-[var(--shadow-modal)]"
		role="dialog"
		aria-modal="true"
		aria-label="Nova descoberta"
		transition:fly={{ y: -12, duration: 180 }}
		onclick={(e) => e.stopPropagation()}
	>
		<!-- Header -->
		<div class="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-5 py-4">
			<div>
				<h2 class="text-[13px] font-semibold text-text-primary">Nova descoberta</h2>
				<p class="text-[11px] text-text-faint">LinkedIn · Easy Apply</p>
			</div>
			<button
				type="button"
				class="flex h-7 w-7 items-center justify-center rounded-md text-text-faint hover:bg-surface-overlay hover:text-text-muted focus-visible:outline-none"
				onclick={onClose}
				aria-label="Fechar"
			>
				<X size={14} />
			</button>
		</div>

		<!-- Body -->
		<div class="flex-1 space-y-4 overflow-y-auto p-5">
			<!-- Keywords -->
			<div>
				<label class="mb-1.5 block text-[11px] font-medium text-text-secondary" for="d-keywords">
					Palavras-chave
				</label>
				<textarea
					id="d-keywords"
					class="min-h-[64px] w-full resize-none rounded-md border border-border-default bg-surface-overlay px-3 py-2 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
					placeholder="Software Engineer&#10;Desenvolvedor Python"
					bind:value={keywords}
				></textarea>
				<p class="mt-1 text-[10px] text-text-faint">Uma palavra-chave por linha</p>
			</div>

			<!-- Local + Máx -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="mb-1.5 block text-[11px] font-medium text-text-secondary" for="d-location">Local</label>
					<input
						id="d-location"
						type="text"
						class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
						placeholder="Brasil"
						bind:value={location}
					/>
				</div>
				<div>
					<label class="mb-1.5 block text-[11px] font-medium text-text-secondary" for="d-max">Máx. vagas</label>
					<input
						id="d-max"
						type="number"
						min="1"
						class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
						placeholder="Ilimitado"
						bind:value={maxJobs}
					/>
				</div>
			</div>

			<!-- Tipo de trabalho + Data -->
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="mb-1.5 block text-[11px] font-medium text-text-secondary" for="d-work-type">Modelo</label>
					<select
						id="d-work-type"
						class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
						bind:value={workType}
					>
						{#each WORK_TYPES as opt (opt.value)}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
				<div>
					<label class="mb-1.5 block text-[11px] font-medium text-text-secondary" for="d-date">Publicado</label>
					<select
						id="d-date"
						class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
						bind:value={datePosted}
					>
						{#each DATE_POSTED as opt (opt.value)}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
			</div>

			<!-- Nível de experiência -->
			<div>
				<p class="mb-2 text-[11px] font-medium text-text-secondary">Nível</p>
				<div class="flex flex-wrap gap-x-4 gap-y-2">
					{#each EXP_LEVELS as level (level.value)}
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								class="accent-accent-500"
								checked={experienceLevel.includes(level.value)}
								onchange={() => { experienceLevel = toggle(experienceLevel, level.value); }}
							/>
							<span class="text-[12px] text-text-muted">{level.label}</span>
						</label>
					{/each}
				</div>
			</div>

			<!-- Tipo de contrato -->
			<div>
				<p class="mb-2 text-[11px] font-medium text-text-secondary">Tipo de contrato</p>
				<div class="flex flex-wrap gap-x-4 gap-y-2">
					{#each JOB_TYPES as jtype (jtype.value)}
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								class="accent-accent-500"
								checked={jobType.includes(jtype.value)}
								onchange={() => { jobType = toggle(jobType, jtype.value); }}
							/>
							<span class="text-[12px] text-text-muted">{jtype.label}</span>
						</label>
					{/each}
				</div>
			</div>

			<!-- Easy Apply -->
			<label class="flex cursor-pointer items-center justify-between gap-4">
				<div>
					<span class="text-[12px] font-medium text-text-secondary">Somente Easy Apply</span>
					<p class="text-[10px] text-text-faint">Apenas vagas com candidatura simplificada</p>
				</div>
				<input type="checkbox" class="accent-accent-500" bind:checked={easyApply} />
			</label>
		</div>

		<!-- Footer -->
		<div class="flex flex-shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-3.5">
			<button
				type="button"
				class="h-8 rounded-md border border-border-default bg-surface-overlay px-3.5 text-[12px] font-medium text-text-muted hover:border-border-strong hover:text-text-secondary focus-visible:outline-none"
				onclick={onClose}
			>
				Cancelar
			</button>
			<button
				type="button"
				class="h-8 rounded-md bg-accent-500 px-3.5 text-[12px] font-medium text-white hover:bg-accent-600 focus-visible:outline-none disabled:opacity-40"
				disabled={busy}
				onclick={handleStart}
			>
				{busy ? 'Iniciando…' : 'Iniciar descoberta'}
			</button>
		</div>
	</div>
</div>

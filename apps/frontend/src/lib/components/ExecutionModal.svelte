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

	const lastConfig = appState.executions[0]?.config ?? appState.discoverConfig;

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
		{ value: 'entry', label: 'Entry-level' },
		{ value: 'senior', label: 'Senior' },
		{ value: 'manager', label: 'Manager' },
		{ value: 'director', label: 'Director' },
		{ value: 'executive', label: 'Executive' }
	];

	const JOB_TYPES = [
		{ value: 'part_time', label: 'Part-time' },
		{ value: 'contract', label: 'Contract' },
		{ value: 'internship', label: 'Internship' },
		{ value: 'full_time', label: 'Full-time' },
		{ value: 'volunteer', label: 'Volunteer' }
	];

	const EXP_LEVEL_VALUES = new Set(EXP_LEVELS.map((level) => level.value));
	const JOB_TYPE_VALUES = new Set(JOB_TYPES.map((type) => type.value));

	let keywords = $state(lastConfig.keywords ?? '');
	let location = $state(lastConfig.location ?? '');
	let maxJobs = $state(lastConfig.maxJobs?.toString() ?? '');
	let workType = $state(lastConfig.workType ?? '');
	let datePosted = $state(lastConfig.datePosted ?? '');
	let experienceLevel = $state<string[]>((lastConfig.experienceLevel ?? []).filter((level) => EXP_LEVEL_VALUES.has(level)));
	let jobType = $state<string[]>((lastConfig.jobType ?? []).filter((type) => JOB_TYPE_VALUES.has(type)));
	let easyApply = $state((lastConfig.options?.easyApply as boolean) ?? true);
	let under10Applicants = $state((lastConfig.options?.under10Applicants as boolean) ?? true);
	let inMyNetwork = $state((lastConfig.options?.inMyNetwork as boolean) ?? false);
	let busy = $state(false);

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
				options: { easyApply, under10Applicants, inMyNetwork }
			};
			await api.startExecution(config);
			appState.discoverConfig = config;
			appState.execution = { ...appState.execution, active: true, running: false, paused: false };
			appState.startExecutionPolling();
			toastState.show('Execução iniciada');
			onClose();
		} catch {
			toastState.show('Falha ao iniciar execução');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

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
		aria-label="Execução"
		tabindex="-1"
		transition:fly={{ y: -12, duration: 180 }}
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
	>
		<div class="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-5 py-4">
			<div>
				<h2 class="text-[13px] font-semibold text-text-primary">Execução</h2>
				<p class="text-[11px] text-text-faint">Configurar a execução contínua</p>
			</div>
			<button
				type="button"
				class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-faint transition-colors duration-150 hover:bg-surface-overlay hover:text-text-muted focus-visible:outline-none"
				onclick={onClose}
				aria-label="Fechar"
			>
				<X size={14} />
			</button>
		</div>

		<div class="flex-1 space-y-4 overflow-y-auto p-5">
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

			<button
				type="button"
				class="flex w-full cursor-pointer items-center justify-between gap-4 text-left focus-visible:outline-none"
				onclick={() => (easyApply = !easyApply)}
			>
				<div>
					<span class="text-[12px] font-medium text-text-secondary">Somente Easy Apply</span>
					<p class="text-[10px] text-text-faint">Apenas vagas com candidatura simplificada</p>
				</div>
				<div
					class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150
						{easyApply ? 'bg-accent-500' : 'bg-surface-overlay border border-border-default'}"
				>
					<span
						class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150
							{easyApply ? 'left-[18px]' : 'left-[3px]'}"
					></span>
				</div>
			</button>

			<button
				type="button"
				class="flex w-full cursor-pointer items-center justify-between gap-4 text-left focus-visible:outline-none"
				onclick={() => (under10Applicants = !under10Applicants)}
			>
				<div>
					<span class="text-[12px] font-medium text-text-secondary">Menos de 10 candidatos</span>
					<p class="text-[10px] text-text-faint">Apenas vagas com baixa concorrência</p>
				</div>
				<div
					class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150
						{under10Applicants ? 'bg-accent-500' : 'bg-surface-overlay border border-border-default'}"
				>
					<span
						class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150
							{under10Applicants ? 'left-[18px]' : 'left-[3px]'}"
					></span>
				</div>
			</button>

			<button
				type="button"
				class="flex w-full cursor-pointer items-center justify-between gap-4 text-left focus-visible:outline-none"
				onclick={() => (inMyNetwork = !inMyNetwork)}
			>
				<div>
					<span class="text-[12px] font-medium text-text-secondary">Na minha rede</span>
					<p class="text-[10px] text-text-faint">Apenas vagas em empresas da sua rede</p>
				</div>
				<div
					class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150
						{inMyNetwork ? 'bg-accent-500' : 'bg-surface-overlay border border-border-default'}"
				>
					<span
						class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150
							{inMyNetwork ? 'left-[18px]' : 'left-[3px]'}"
					></span>
				</div>
			</button>
		</div>

		<div class="flex flex-shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-3.5">
			<button
				type="button"
				class="h-8 cursor-pointer rounded-md border border-border-default bg-surface-overlay px-3.5 text-[12px] font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary focus-visible:outline-none"
				onclick={onClose}
			>
				Cancelar
			</button>
			<button
				type="button"
				class="h-8 cursor-pointer rounded-md bg-accent-500 px-3.5 text-[12px] font-medium text-accent-text transition-colors duration-150 hover:bg-accent-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
				disabled={busy}
				onclick={handleStart}
			>
				{busy ? 'Iniciando…' : 'Iniciar execução'}
			</button>
		</div>
	</div>
</div>

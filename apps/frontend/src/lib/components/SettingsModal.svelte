<script lang="ts">
	import Play from '@lucide/svelte/icons/play';
	import Star from '@lucide/svelte/icons/star';
	import Upload from '@lucide/svelte/icons/upload';
	import X from '@lucide/svelte/icons/x';
	import * as api from '$lib/api';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';
	import type { RunConfig } from '$lib/types';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	let cfg = $state<RunConfig>({ ...appState.config });
	let locationStr = $state(appState.config.location ?? '');
	let maxApplyStr = $state(appState.config.max_apply?.toString() ?? '');
	let workTypeStr = $state(appState.config.work_type ?? '');
	let datePostedStr = $state(appState.config.date_posted ?? '');
	let busy = $state(false);

	const WORK_TYPES = [
		{ value: '', label: 'Any' },
		{ value: 'remote', label: 'Remote' },
		{ value: 'hybrid', label: 'Hybrid' },
		{ value: 'onsite', label: 'On-site' },
		{ value: 'remote,hybrid', label: 'Remote + Hybrid' }
	];

	const DATE_POSTED = [
		{ value: '', label: 'Any time' },
		{ value: 'day', label: 'Past 24 hours' },
		{ value: 'week', label: 'Past week' },
		{ value: 'month', label: 'Past month' }
	];

	const EXP_LEVELS = [
		{ value: 'entry', label: 'Entry level' },
		{ value: 'associate', label: 'Associate' },
		{ value: 'mid_senior', label: 'Mid-Senior' },
		{ value: 'director', label: 'Director' },
		{ value: 'executive', label: 'Executive' }
	];

	const JOB_TYPES = [
		{ value: 'full_time', label: 'Full-time' },
		{ value: 'part_time', label: 'Part-time' },
		{ value: 'contract', label: 'Contract' },
		{ value: 'temporary', label: 'Temporary' },
		{ value: 'internship', label: 'Internship' }
	];

	function toggle(arr: string[], val: string): string[] {
		return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	async function handleStart() {
		if (busy) return;
		busy = true;
		try {
			const config: RunConfig = {
				...cfg,
				location: locationStr.trim() || null,
				max_apply: maxApplyStr ? parseInt(maxApplyStr, 10) : null,
				work_type: workTypeStr || null,
				date_posted: datePostedStr || null
			};
			await api.startRun(config);
			appState.config = config;
			appState.run.running = true;
			toastState.show('Run started');
			onClose();
		} catch {
			toastState.show('Failed to start run');
		} finally {
			busy = false;
		}
	}

	async function handleUpload(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const { filename } = await api.uploadCV(file);
			if (!appState.cvs.includes(filename)) appState.cvs = [...appState.cvs, filename];
			toastState.show(`CV uploaded: ${filename}`);
		} catch {
			toastState.show('Failed to upload CV');
		}
		(e.target as HTMLInputElement).value = '';
	}

	async function handleSetDefault(filename: string) {
		try {
			await api.setDefaultCV(filename);
			appState.defaultCV = filename;
			toastState.show('Default CV updated');
		} catch {
			toastState.show('Failed to set default CV');
		}
	}

	async function handleDeleteCV(filename: string) {
		try {
			await api.deleteCV(filename);
			appState.cvs = appState.cvs.filter((c) => c !== filename);
			if (appState.defaultCV === filename) appState.defaultCV = null;
			toastState.show(`Deleted ${filename}`);
		} catch {
			toastState.show('Failed to delete CV');
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
		class="relative z-10 mt-12 flex max-h-[calc(100vh-96px)] w-[min(560px,100%)] flex-col border border-border-default bg-surface-raised shadow-lg"
		role="dialog"
		aria-modal="true"
		aria-label="Settings"
	>
		<!-- Header -->
		<div
			class="flex min-h-14 flex-shrink-0 items-center justify-between border-b border-border-subtle px-5"
		>
			<h2 class="text-sm font-bold text-text-primary">Settings</h2>
			<button
				class="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center border border-border-default bg-surface-overlay p-0 text-[#4a6a88] hover:border-border-strong hover:text-[#7aaac8] focus-visible:border-border-strong focus-visible:text-[#7aaac8] focus-visible:outline-0"
				type="button"
				aria-label="Close"
				onclick={onClose}
			>
				<X size={16} strokeWidth={2.25} aria-hidden="true" />
			</button>
		</div>

		<!-- Body -->
		<div class="flex-1 space-y-6 overflow-y-auto p-5">
			<!-- Keywords -->
			<div>
				<label
					class="mb-2 block text-xs font-bold uppercase tracking-wide text-text-secondary"
					for="keywords"
				>
					Keywords
				</label>
				<textarea
					id="keywords"
					class="min-h-20 w-full resize-none border border-border-default bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder-text-placeholder focus:border-border-strong focus:outline-0"
					placeholder="Software Engineer&#10;Python Developer"
					bind:value={cfg.keywords}
				></textarea>
				<p class="mt-1 text-xs text-text-muted">One keyword per line</p>
			</div>

			<!-- Location + Max apply -->
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label
						class="mb-2 block text-xs font-bold uppercase tracking-wide text-text-secondary"
						for="location"
					>
						Location
					</label>
					<input
						id="location"
						type="text"
						class="h-9 w-full border border-border-default bg-surface-overlay px-3 text-sm text-text-primary placeholder-text-placeholder focus:border-border-strong focus:outline-0"
						placeholder="Brazil"
						bind:value={locationStr}
					/>
				</div>
				<div>
					<label
						class="mb-2 block text-xs font-bold uppercase tracking-wide text-text-secondary"
						for="max-apply"
					>
						Max applications
					</label>
					<input
						id="max-apply"
						type="number"
						min="1"
						class="h-9 w-full border border-border-default bg-surface-overlay px-3 text-sm text-text-primary placeholder-text-placeholder focus:border-border-strong focus:outline-0"
						placeholder="Unlimited"
						bind:value={maxApplyStr}
					/>
				</div>
			</div>

			<!-- Work type + Date posted -->
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label
						class="mb-2 block text-xs font-bold uppercase tracking-wide text-text-secondary"
						for="work-type"
					>
						Work type
					</label>
					<select
						id="work-type"
						class="h-9 w-full border border-border-default bg-surface-overlay px-3 text-sm text-text-primary focus:border-border-strong focus:outline-0"
						bind:value={workTypeStr}
					>
						{#each WORK_TYPES as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</div>
				<div>
					<label
						class="mb-2 block text-xs font-bold uppercase tracking-wide text-text-secondary"
						for="date-posted"
					>
						Date posted
					</label>
					<select
						id="date-posted"
						class="h-9 w-full border border-border-default bg-surface-overlay px-3 text-sm text-text-primary focus:border-border-strong focus:outline-0"
						bind:value={datePostedStr}
					>
						{#each DATE_POSTED as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</div>
			</div>

			<!-- Experience level -->
			<div>
				<p class="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary">
					Experience level
				</p>
				<div class="flex flex-wrap gap-x-5 gap-y-2">
					{#each EXP_LEVELS as level (level.value)}
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								class="accent-brand-500"
								checked={cfg.experience_level.includes(level.value)}
								onchange={() => {
									cfg.experience_level = toggle(cfg.experience_level, level.value);
								}}
							/>
							<span class="text-sm text-text-secondary">{level.label}</span>
						</label>
					{/each}
				</div>
			</div>

			<!-- Job type -->
			<div>
				<p class="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary">Job type</p>
				<div class="flex flex-wrap gap-x-5 gap-y-2">
					{#each JOB_TYPES as jtype (jtype.value)}
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								class="accent-brand-500"
								checked={cfg.job_type.includes(jtype.value)}
								onchange={() => {
									cfg.job_type = toggle(cfg.job_type, jtype.value);
								}}
							/>
							<span class="text-sm text-text-secondary">{jtype.label}</span>
						</label>
					{/each}
				</div>
			</div>

			<!-- Toggles -->
			<div class="space-y-3">
				<label class="flex cursor-pointer items-center justify-between">
					<span class="text-sm text-text-secondary">Easy Apply only</span>
					<input type="checkbox" class="accent-brand-500" bind:checked={cfg.easy_apply} />
				</label>
				<label class="flex cursor-pointer items-center justify-between">
					<span class="text-sm text-text-secondary">Fill skill gaps</span>
					<input type="checkbox" class="accent-brand-500" bind:checked={cfg.fill_skill_gaps} />
				</label>
				<label class="flex cursor-pointer items-center justify-between">
					<span class="flex items-center gap-2 text-sm text-warn-500">
						<Star size={13} aria-hidden="true" />
						Top Applicant <span class="text-text-muted">(Premium)</span>
					</span>
					<input
						type="checkbox"
						class="accent-warn-500"
						bind:checked={cfg.include_top_applicant}
					/>
				</label>
			</div>

			<!-- CVs -->
			<div>
				<div class="mb-3 flex items-center justify-between">
					<p class="text-xs font-bold uppercase tracking-wide text-text-secondary">
						CVs ({appState.cvs.length})
					</p>
					<label
						class="inline-flex min-h-8 cursor-pointer items-center gap-1.5 border border-border-default bg-surface-overlay px-3 text-xs font-bold text-text-secondary hover:border-border-strong hover:text-text-primary"
					>
						<Upload size={12} aria-hidden="true" />
						Upload CV
						<input
							type="file"
							class="sr-only"
							accept=".pdf,.doc,.docx"
							onchange={handleUpload}
						/>
					</label>
				</div>

				{#if appState.cvs.length === 0}
					<p class="text-xs text-text-muted">No CVs uploaded.</p>
				{:else}
					<div class="space-y-2">
						{#each appState.cvs as filename (filename)}
							<div
								class="flex items-center gap-2 border border-border-subtle bg-surface-overlay px-3 py-2"
							>
								<span class="min-w-0 flex-1 truncate text-sm text-text-primary">{filename}</span>
								{#if appState.defaultCV === filename}
									<span class="shrink-0 text-[11px] font-bold text-success-500">DEFAULT</span>
								{:else}
									<button
										class="shrink-0 text-[11px] font-bold text-text-muted hover:text-text-secondary"
										type="button"
										onclick={() => handleSetDefault(filename)}
									>
										Set default
									</button>
								{/if}
								<button
									class="shrink-0 text-[11px] font-bold text-danger-500 hover:text-danger-600"
									type="button"
									onclick={() => handleDeleteCV(filename)}
								>
									Delete
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Footer -->
		<div
			class="flex flex-shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-4"
		>
			<button
				class="inline-flex min-h-9 cursor-pointer items-center justify-center border border-border-default bg-surface-overlay px-4 text-[13px] font-bold text-text-secondary hover:border-border-strong hover:text-text-primary focus-visible:outline-0"
				type="button"
				onclick={onClose}
			>
				Cancel
			</button>
			<button
				class="inline-flex min-h-9 cursor-pointer items-center justify-center gap-[6px] border border-transparent bg-brand-500 px-4 text-[13px] font-bold text-brand-on transition-[filter] duration-100 hover:brightness-110 focus-visible:outline-0 disabled:cursor-not-allowed disabled:opacity-50"
				type="button"
				disabled={busy}
				onclick={handleStart}
			>
				<Play size={14} strokeWidth={2.5} aria-hidden="true" />
				{busy ? 'Starting…' : 'Start Run'}
			</button>
		</div>
	</div>
</div>

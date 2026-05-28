<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
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
		{ value: '', label: 'Any' },
		{ value: 'remote', label: 'Remote' },
		{ value: 'hybrid', label: 'Hybrid' },
		{ value: 'onsite', label: 'On-site' }
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
			appState.discovery = discovery;
			appState.startPolling(discovery.id);
			toastState.show('Discovery started');
			onClose();
		} catch {
			toastState.show('Failed to start discovery');
		} finally {
			busy = false;
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
		class="relative z-10 mt-12 flex max-h-[calc(100vh-96px)] w-[min(520px,100%)] flex-col border border-border-default bg-surface-raised shadow-lg"
		role="dialog"
		aria-modal="true"
		aria-label="Discover jobs"
	>
		<!-- Header -->
		<div class="flex min-h-14 flex-shrink-0 items-center justify-between border-b border-border-subtle px-5">
			<div>
				<h2 class="text-sm font-bold text-text-primary">Discover jobs</h2>
				<p class="text-xs text-text-muted">LinkedIn · Easy Apply</p>
			</div>
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
		<div class="flex-1 space-y-5 overflow-y-auto p-5">
			<!-- Keywords -->
			<div>
				<label class="mb-2 block text-xs font-bold uppercase tracking-wide text-text-secondary" for="d-keywords">
					Keywords
				</label>
				<textarea
					id="d-keywords"
					class="min-h-[72px] w-full resize-none border border-border-default bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder-text-placeholder focus:border-border-strong focus:outline-0"
					placeholder="Software Engineer&#10;Python Developer"
					bind:value={keywords}
				></textarea>
				<p class="mt-1 text-xs text-text-muted">One keyword per line</p>
			</div>

			<!-- Location + Max jobs -->
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label class="mb-2 block text-xs font-bold uppercase tracking-wide text-text-secondary" for="d-location">
						Location
					</label>
					<input
						id="d-location"
						type="text"
						class="h-9 w-full border border-border-default bg-surface-overlay px-3 text-sm text-text-primary placeholder-text-placeholder focus:border-border-strong focus:outline-0"
						placeholder="Brazil"
						bind:value={location}
					/>
				</div>
				<div>
					<label class="mb-2 block text-xs font-bold uppercase tracking-wide text-text-secondary" for="d-max">
						Max jobs
					</label>
					<input
						id="d-max"
						type="number"
						min="1"
						class="h-9 w-full border border-border-default bg-surface-overlay px-3 text-sm text-text-primary placeholder-text-placeholder focus:border-border-strong focus:outline-0"
						placeholder="Unlimited"
						bind:value={maxJobs}
					/>
				</div>
			</div>

			<!-- Work type + Date posted -->
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label class="mb-2 block text-xs font-bold uppercase tracking-wide text-text-secondary" for="d-work-type">
						Work type
					</label>
					<select
						id="d-work-type"
						class="h-9 w-full border border-border-default bg-surface-overlay px-3 text-sm text-text-primary focus:border-border-strong focus:outline-0"
						bind:value={workType}
					>
						{#each WORK_TYPES as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="mb-2 block text-xs font-bold uppercase tracking-wide text-text-secondary" for="d-date">
						Date posted
					</label>
					<select
						id="d-date"
						class="h-9 w-full border border-border-default bg-surface-overlay px-3 text-sm text-text-primary focus:border-border-strong focus:outline-0"
						bind:value={datePosted}
					>
						{#each DATE_POSTED as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</div>
			</div>

			<!-- Experience level -->
			<div>
				<p class="mb-2 text-xs font-bold uppercase tracking-wide text-text-secondary">Experience level</p>
				<div class="flex flex-wrap gap-x-5 gap-y-2">
					{#each EXP_LEVELS as level (level.value)}
						<label class="flex cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								class="accent-brand-500"
								checked={experienceLevel.includes(level.value)}
								onchange={() => { experienceLevel = toggle(experienceLevel, level.value); }}
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
								checked={jobType.includes(jtype.value)}
								onchange={() => { jobType = toggle(jobType, jtype.value); }}
							/>
							<span class="text-sm text-text-secondary">{jtype.label}</span>
						</label>
					{/each}
				</div>
			</div>

			<!-- Easy Apply -->
			<div>
				<label class="flex cursor-pointer items-center justify-between">
					<div>
						<span class="text-sm font-medium text-text-secondary">Easy Apply only</span>
						<p class="text-xs text-text-muted">Only show jobs with LinkedIn Easy Apply</p>
					</div>
					<input type="checkbox" class="accent-brand-500" bind:checked={easyApply} />
				</label>
			</div>
		</div>

		<!-- Footer -->
		<div class="flex flex-shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-4">
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
				<Search size={14} strokeWidth={2.5} aria-hidden="true" />
				{busy ? 'Starting…' : 'Start Discovery'}
			</button>
		</div>
	</div>
</div>

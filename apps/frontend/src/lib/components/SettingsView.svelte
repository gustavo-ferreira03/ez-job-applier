<script lang="ts">
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import FileText from '@lucide/svelte/icons/file-text';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';
	import { onMount } from 'svelte';
	import * as api from '$lib/api';
	import type { ProviderInfo } from '$lib/api';
	import type { AppSettings, DiscoverConfig, LlmSettings } from '$lib/types';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';
	import ProvidersModal from './ProvidersModal.svelte';

	type Tab = 'geral' | 'ia' | 'avancado';
	type SettingsPatch = Partial<{
		general: Omit<Partial<AppSettings['general']>, 'execution'> & { execution?: Partial<DiscoverConfig> };
		advanced: Partial<AppSettings['advanced']>;
	}>;

	const WORK_TYPES = [
		{ value: '', label: 'Any' },
		{ value: 'remote', label: 'Remote' },
		{ value: 'hybrid', label: 'Hybrid' },
		{ value: 'onsite', label: 'On-site' }
	];

	const DATE_POSTED = [
		{ value: '', label: 'Any time' },
		{ value: 'day', label: 'Last 24h' },
		{ value: 'week', label: 'Last week' },
		{ value: 'month', label: 'Last month' }
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

	const tabs: { id: Tab; label: string; description: string }[] = [
		{ id: 'geral', label: 'General', description: 'Search and resume' },
		{ id: 'ia', label: 'AI', description: 'Model and automation' },
		{ id: 'avancado', label: 'Advanced', description: 'System and data' }
	];

	let activeTab = $state<Tab>('geral');
	let configuredProviders = $state<ProviderInfo[]>([]);
	let providersModalOpen = $state(false);
	let clearConfirming = $state(false);
	let settingsDebounce: ReturnType<typeof setTimeout> | null = null;
	let pendingSettingsPatch: SettingsPatch = {};
	let filterCriteriaDebounce: ReturnType<typeof setTimeout> | null = null;
	let blockedKeywordInput = $state('');
	let blockedCompanyInput = $state('');

	function mergeSettings(base: AppSettings, patch: SettingsPatch): AppSettings {
		const execution = patch.general?.execution
			? {
					...base.general.execution,
					...patch.general.execution,
					options: {
						...(base.general.execution.options ?? {}),
						...(patch.general.execution.options ?? {})
					}
				}
			: base.general.execution;

		return {
			...base,
			general: { ...base.general, ...patch.general, execution },
			advanced: { ...base.advanced, ...patch.advanced }
		};
	}

	function mergePatch(base: SettingsPatch, patch: SettingsPatch): SettingsPatch {
		return {
			general: patch.general
				? {
						...base.general,
						...patch.general,
						execution: patch.general.execution
							? {
									...(base.general?.execution ?? {}),
									...patch.general.execution,
									options: {
										...(base.general?.execution?.options ?? {}),
										...(patch.general.execution.options ?? {})
									}
								}
							: base.general?.execution
					}
				: base.general,
			advanced: patch.advanced ? { ...base.advanced, ...patch.advanced } : base.advanced
		};
	}

	function scheduleSettingsPatch(patch: SettingsPatch) {
		appState.settings = mergeSettings(appState.settings, patch);
		pendingSettingsPatch = mergePatch(pendingSettingsPatch, patch);

		if (settingsDebounce !== null) clearTimeout(settingsDebounce);
		settingsDebounce = setTimeout(async () => {
			const patchToSave = pendingSettingsPatch;
			pendingSettingsPatch = {};
			try {
				appState.settings = await api.updateAppSettings(patchToSave as Partial<AppSettings>);
			} catch {
				toastState.show('Failed to save settings', 'error');
			}
		}, 500);
	}

	async function saveSettingsPatch(patch: SettingsPatch) {
		appState.settings = mergeSettings(appState.settings, patch);
		try {
			appState.settings = await api.updateAppSettings(patch as Partial<AppSettings>);
		} catch {
			toastState.show('Failed to save settings', 'error');
		}
	}

	async function refreshLlmSettings() {
		try {
			const res = await api.getLlmSettings();
			appState.settings = { ...appState.settings, llm: res.current };
			configuredProviders = res.providers.filter((p) => p.configured);
		} catch {
			toastState.show('Failed to load AI settings', 'error');
		}
	}

	onMount(() => {
		refreshLlmSettings();
	});

	async function handleLlmSetting(update: Partial<LlmSettings>) {
		try {
			const llm = await api.updateLlmSettings(update);
			appState.settings = { ...appState.settings, llm };
		} catch {
			toastState.show('Failed to save AI setting', 'error');
		}
	}

	function handleFilterCriteriaInput(value: string) {
		appState.settings = { ...appState.settings, llm: { ...appState.settings.llm, filterCriteria: value } };
		if (filterCriteriaDebounce !== null) clearTimeout(filterCriteriaDebounce);
		filterCriteriaDebounce = setTimeout(() => {
			handleLlmSetting({ filterCriteria: value });
		}, 600);
	}

	function toggle(arr: string[] | undefined, value: string): string[] {
		const list = arr ?? [];
		return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
	}

	function addBlockedKeyword() {
		const val = blockedKeywordInput.trim();
		if (!val) return;
		const list = appState.settings.general.blockedKeywords ?? [];
		if (!list.includes(val)) scheduleSettingsPatch({ general: { blockedKeywords: [...list, val] } });
		blockedKeywordInput = '';
	}

	function removeBlockedKeyword(kw: string) {
		scheduleSettingsPatch({ general: { blockedKeywords: (appState.settings.general.blockedKeywords ?? []).filter((k) => k !== kw) } });
	}

	function addBlockedCompany() {
		const val = blockedCompanyInput.trim();
		if (!val) return;
		const list = appState.settings.general.blockedCompanies ?? [];
		if (!list.includes(val)) scheduleSettingsPatch({ general: { blockedCompanies: [...list, val] } });
		blockedCompanyInput = '';
	}

	function removeBlockedCompany(co: string) {
		scheduleSettingsPatch({ general: { blockedCompanies: (appState.settings.general.blockedCompanies ?? []).filter((c) => c !== co) } });
	}

	function setExecution(patch: Partial<DiscoverConfig>) {
		scheduleSettingsPatch({ general: { execution: patch } });
	}

	function setExecutionOption(key: string, value: boolean) {
		scheduleSettingsPatch({ general: { execution: { options: { [key]: value } } } });
	}

	function setAdvancedNumber(key: 'cycleMaxMs' | 'intervalMs', value: string) {
		const minutes = Number(value);
		if (!Number.isFinite(minutes) || minutes <= 0) return;
		scheduleSettingsPatch({ advanced: { [key]: Math.round(minutes * 60_000) } });
	}

	async function handleUpload(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const { filename } = await api.uploadResume(file);
			if (!appState.resumes.includes(filename)) appState.resumes = [...appState.resumes, filename];
			if (appState.resumes.length === 1) await handleSetDefault(filename);
			toastState.show(`Uploaded: ${filename}`, 'success');
		} catch {
			toastState.show('Upload failed', 'error');
		}
		(e.target as HTMLInputElement).value = '';
	}

	async function handleSetDefault(filename: string | null) {
		try {
			await api.setDefaultResume(filename);
			appState.defaultResume = filename;
			appState.settings = mergeSettings(appState.settings, { general: { defaultResume: filename } });
			toastState.show('Default resume updated', 'success');
		} catch {
			toastState.show('Failed to set default', 'error');
		}
	}

	async function handleDelete(filename: string) {
		try {
			await api.deleteResume(filename);
			appState.resumes = appState.resumes.filter((r) => r !== filename);
			if (appState.defaultResume === filename) {
				appState.defaultResume = null;
				appState.settings = mergeSettings(appState.settings, { general: { defaultResume: null } });
			}
			toastState.show(`${filename} removed`, 'success');
		} catch {
			toastState.show('Failed to remove resume', 'error');
		}
	}

	async function handleClearDatabase() {
		if (!clearConfirming) {
			clearConfirming = true;
			return;
		}

		try {
			await api.clearDatabase();
			appState.jobs = [];
			clearConfirming = false;
			toastState.show('Jobs and applications cleared', 'success');
		} catch {
			clearConfirming = false;
			toastState.show('Failed to clear database', 'error');
		}
	}
</script>

	<div class="h-full overflow-y-auto">
	<div class="mx-auto max-w-xl p-6">
		<div class="mb-6">
			<div>
				<h2 class="text-[15px] font-semibold text-text-primary">Settings</h2>
				<p class="mt-1 text-[11px] text-text-faint">Define the profile used by automatic execution.</p>
			</div>

			<div class="mt-4 grid grid-cols-3 overflow-hidden rounded-lg border border-border-default bg-surface-overlay">
				{#each tabs as tab (tab.id)}
					<button
						type="button"
						class="cursor-pointer px-3 py-2 text-center transition-colors duration-150 focus-visible:outline-none {activeTab === tab.id ? 'bg-accent-500 text-accent-text' : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'}"
						onclick={() => { activeTab = tab.id; }}
					>
						<span class="block text-[12px] font-semibold">{tab.label}</span>
					</button>
				{/each}
			</div>
		</div>

		{#if activeTab === 'geral'}
			<div>
				<section class="mb-6">
					<div class="mb-4">
						<h3 class="text-[10px] font-semibold uppercase tracking-wide text-text-faint">Execution profile</h3>
						<p class="mt-1 text-[11px] text-text-faint">These filters are used directly by the “Start execution” button.</p>
					</div>

					<div class="space-y-4">
						<div>
							<label class="mb-1.5 block text-[11px] font-medium text-text-secondary" for="settings-keywords">Keywords</label>
							<textarea
								id="settings-keywords"
								class="min-h-19 w-full resize-none rounded-md border border-border-default bg-surface-overlay px-3 py-2 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
								placeholder="Software Engineer&#10;Python Developer"
								value={appState.settings.general.execution.keywords ?? ''}
								oninput={(e) => setExecution({ keywords: (e.target as HTMLTextAreaElement).value || undefined })}
							></textarea>
							<p class="mt-1 text-[10px] text-text-faint">Required. One keyword per line.</p>
						</div>

						<div class="grid gap-3 sm:grid-cols-2">
							<div>
								<label class="mb-1.5 block text-[11px] font-medium text-text-secondary" for="settings-location">Location</label>
								<input
									id="settings-location"
									type="text"
									class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
									placeholder="Brasil"
									value={appState.settings.general.execution.location ?? ''}
									oninput={(e) => setExecution({ location: (e.target as HTMLInputElement).value || undefined })}
								/>
							</div>

							<div>
								<label class="mb-1.5 block text-[11px] font-medium text-text-secondary" for="settings-max-jobs">Max jobs</label>
								<input
									id="settings-max-jobs"
									type="number"
									min="1"
									class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
									placeholder="Unlimited"
									value={appState.settings.general.execution.maxJobs ?? ''}
									oninput={(e) => {
										const value = (e.target as HTMLInputElement).value;
										setExecution({ maxJobs: value ? Number(value) : undefined });
									}}
								/>
							</div>
						</div>

						<div class="grid gap-3 sm:grid-cols-2">
							<div>
								<label class="mb-1.5 block text-[11px] font-medium text-text-secondary" for="settings-work-type">Work model</label>
								<select
									id="settings-work-type"
									class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
									value={appState.settings.general.execution.workType ?? ''}
									onchange={(e) => setExecution({ workType: (e.target as HTMLSelectElement).value || undefined })}
								>
									{#each WORK_TYPES as opt (opt.value)}<option value={opt.value}>{opt.label}</option>{/each}
								</select>
							</div>

							<div>
								<label class="mb-1.5 block text-[11px] font-medium text-text-secondary" for="settings-date-posted">Posted</label>
								<select
									id="settings-date-posted"
									class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
									value={appState.settings.general.execution.datePosted ?? ''}
									onchange={(e) => setExecution({ datePosted: (e.target as HTMLSelectElement).value || undefined })}
								>
									{#each DATE_POSTED as opt (opt.value)}<option value={opt.value}>{opt.label}</option>{/each}
								</select>
							</div>
						</div>

						<div>
							<p class="mb-2 text-[11px] font-medium text-text-secondary">Level</p>
							<div class="flex flex-wrap gap-x-4 gap-y-2">
								{#each EXP_LEVELS as level (level.value)}
									<label class="flex cursor-pointer items-center gap-2">
										<input
											type="checkbox"
											class="accent-accent-500"
											checked={(appState.settings.general.execution.experienceLevel ?? []).includes(level.value)}
											onchange={() => setExecution({ experienceLevel: toggle(appState.settings.general.execution.experienceLevel, level.value) })}
										/>
										<span class="text-[12px] text-text-muted">{level.label}</span>
									</label>
								{/each}
							</div>
						</div>

						<div>
							<p class="mb-2 text-[11px] font-medium text-text-secondary">Job type</p>
							<div class="flex flex-wrap gap-x-4 gap-y-2">
								{#each JOB_TYPES as jtype (jtype.value)}
									<label class="flex cursor-pointer items-center gap-2">
										<input
											type="checkbox"
											class="accent-accent-500"
											checked={(appState.settings.general.execution.jobType ?? []).includes(jtype.value)}
											onchange={() => setExecution({ jobType: toggle(appState.settings.general.execution.jobType, jtype.value) })}
										/>
										<span class="text-[12px] text-text-muted">{jtype.label}</span>
									</label>
								{/each}
							</div>
						</div>

						<div class="space-y-2">
							{#each [
								{ key: 'easyApply', label: 'Easy Apply only', desc: 'Only jobs with simplified applications' },
								{ key: 'under10Applicants', label: 'Under 10 applicants', desc: 'Only jobs with lower competition' },
								{ key: 'inMyNetwork', label: 'In my network', desc: 'Only jobs at companies in your network' }
							] as opt (opt.key)}
								<button
									type="button"
									class="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-left transition-colors duration-150 hover:border-border-default focus-visible:outline-none"
									onclick={() => setExecutionOption(opt.key, !(appState.settings.general.execution.options?.[opt.key] as boolean))}
								>
									<div>
										<p class="text-[12px] font-medium text-text-primary">{opt.label}</p>
										<p class="text-[10px] text-text-faint">{opt.desc}</p>
									</div>
									<div class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150 {(appState.settings.general.execution.options?.[opt.key] as boolean) ? 'bg-accent-500' : 'bg-surface-overlay border border-border-default'}">
										<span class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150 {(appState.settings.general.execution.options?.[opt.key] as boolean) ? 'left-[18px]' : 'left-[3px]'}"></span>
									</div>
								</button>
							{/each}
						</div>
					</div>
				</section>

				<section class="mb-6">
					<div class="mb-4">
						<h3 class="text-[10px] font-semibold uppercase tracking-wide text-text-faint">Static filters</h3>
						<p class="mt-1 text-[11px] text-text-faint">Jobs matching these are automatically rejected, regardless of AI settings.</p>
					</div>

					<div class="space-y-4">
						{#snippet tagInput(label: string, desc: string, tags: string[], inputVal: string, onInput: (v: string) => void, onAdd: () => void, onRemove: (v: string) => void, onKeydown: (e: KeyboardEvent) => void)}
							<div>
								<p class="mb-1 text-[11px] font-medium text-text-secondary">{label}</p>
								<p class="mb-2 text-[10px] text-text-faint">{desc}</p>
								{#if tags.length > 0}
									<div class="mb-2 flex flex-wrap gap-1.5">
										{#each tags as tag (tag)}
											<span class="flex items-center gap-1 rounded-md border border-border-default bg-surface-overlay px-2 py-0.5 text-[11px] text-text-secondary">
												{tag}
												<button type="button" class="cursor-pointer text-text-faint transition-colors duration-100 hover:text-text-primary focus-visible:outline-none" onclick={() => onRemove(tag)} aria-label="Remove {tag}">×</button>
											</span>
										{/each}
									</div>
								{/if}
								<div class="flex gap-2">
									<input
										type="text"
										class="h-7 flex-1 rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
										value={inputVal}
										oninput={(e) => onInput((e.target as HTMLInputElement).value)}
										onkeydown={onKeydown}
									/>
									<button type="button" class="h-7 cursor-pointer rounded-md border border-border-default bg-surface-overlay px-3 text-[11px] font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary focus-visible:outline-none" onclick={onAdd}>Add</button>
								</div>
							</div>
						{/snippet}

						{@render tagInput(
							'Blocked keywords',
							'Matches job title, description, and skills (whole word, case-insensitive).',
							appState.settings.general.blockedKeywords ?? [],
							blockedKeywordInput,
							(v) => { blockedKeywordInput = v; },
							addBlockedKeyword,
							removeBlockedKeyword,
							(e) => { if (e.key === 'Enter') { e.preventDefault(); addBlockedKeyword(); } }
						)}

						{@render tagInput(
							'Blocked companies',
							'Matches the company name that posted the job.',
							appState.settings.general.blockedCompanies ?? [],
							blockedCompanyInput,
							(v) => { blockedCompanyInput = v; },
							addBlockedCompany,
							removeBlockedCompany,
							(e) => { if (e.key === 'Enter') { e.preventDefault(); addBlockedCompany(); } }
						)}
					</div>
				</section>

				<section class="mb-6">
					<div class="mb-3 flex items-center justify-between">
						<div>
							<h3 class="text-[10px] font-semibold uppercase tracking-wide text-text-faint">Resumes</h3>
							<p class="mt-1 text-[11px] text-text-faint">Required to start execution.</p>
						</div>
						<label class="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border-default bg-surface-overlay px-2.5 text-[11px] font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary">
							<Upload size={11} aria-hidden="true" />
							Upload
							<input type="file" class="sr-only" accept=".pdf" onchange={handleUpload} />
						</label>
					</div>

					{#if appState.resumes.length === 0}
						<div class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-subtle py-10 text-center">
							<FileText size={24} strokeWidth={1.5} class="text-text-faint" aria-hidden="true" />
							<p class="text-[11px] text-text-faint">No resumes uploaded</p>
						</div>
					{:else}
						<div class="space-y-1.5">
							{#each appState.resumes as filename (filename)}
								<div class="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-overlay px-3 py-2.5">
									<div class="flex min-w-0 flex-1 items-center gap-2">
										<FileText size={13} strokeWidth={1.75} class="flex-shrink-0 text-text-faint" aria-hidden="true" />
										<span class="min-w-0 flex-1 truncate text-[12px] text-text-primary">{filename}</span>
									</div>
									<div class="flex flex-shrink-0 items-center gap-3">
										{#if appState.defaultResume === filename}
											<span class="text-[10px] font-bold text-[#22c55e]">DEFAULT</span>
										{:else}
											<button type="button" class="cursor-pointer text-[10px] font-medium text-text-faint transition-colors duration-150 hover:text-text-muted focus-visible:outline-none" onclick={() => handleSetDefault(filename)}>Set default</button>
										{/if}
										<button type="button" class="cursor-pointer text-[10px] font-medium text-[#ef4444] transition-colors duration-150 hover:text-[#dc2626] focus-visible:outline-none" onclick={() => handleDelete(filename)}>Remove</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</section>
			</div>
		{:else if activeTab === 'ia'}
			<section class="mb-6">
				<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h3 class="text-[10px] font-semibold uppercase tracking-wide text-text-faint">Artificial Intelligence</h3>
						<p class="mt-1 text-[11px] text-text-faint">Control provider, model, and automated behaviors.</p>
					</div>
					<button type="button" class="h-8 cursor-pointer rounded-md border border-border-default bg-surface-overlay px-3.5 text-[12px] font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary focus-visible:outline-none" onclick={() => (providersModalOpen = true)}>Manage providers</button>
				</div>

				<div class="mb-4 space-y-1.5">
					{#each configuredProviders as p (p.id)}
						<div class="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-overlay px-3 py-2.5">
							<span class="min-w-0 flex-1 text-[12px] text-text-primary">{p.name}</span>
							<span class="text-[10px] font-bold text-[#22c55e]">CONFIGURED</span>
						</div>
					{/each}
					{#if configuredProviders.length === 0}
						<p class="text-[11px] text-text-faint">No providers configured</p>
					{/if}
				</div>

				<button type="button" class="mb-2 flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-overlay px-4 py-3 text-left transition-colors duration-150 hover:border-border-default focus-visible:outline-none" onclick={() => handleLlmSetting({ enabled: !appState.settings.llm.enabled })}>
					<div>
						<p class="text-[12px] font-medium text-text-primary">Enable AI</p>
						<p class="text-[11px] text-text-faint">{appState.settings.llm.enabled ? 'AI enabled' : 'AI disabled'}</p>
					</div>
					<div class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150 {appState.settings.llm.enabled ? 'bg-accent-500' : 'bg-surface-overlay border border-border-default'}">
						<span class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150 {appState.settings.llm.enabled ? 'left-[18px]' : 'left-[3px]'}"></span>
					</div>
				</button>

				<div class="space-y-2 {appState.settings.llm.enabled ? '' : 'opacity-50'} transition-opacity duration-150">
					{#each [
						{ key: 'filterJobs' as const, label: 'Filter jobs', desc: 'Automatically rejects jobs outside your profile' },
						{ key: 'autoAnswer' as const, label: 'Auto-answer questions', desc: 'Automatically fills application questions' },
						{ key: 'externalApply' as const, label: 'Apply to external jobs', desc: 'Uses an agent to fill external ATS forms' }
					] as feat (feat.key)}
						<button type="button" class="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-overlay px-4 py-3 text-left transition-colors duration-150 hover:border-border-default focus-visible:outline-none" onclick={() => handleLlmSetting({ [feat.key]: !appState.settings.llm[feat.key] })}>
							<div>
								<p class="text-[12px] font-medium text-text-primary">{feat.label}</p>
								<p class="text-[11px] text-text-faint">{feat.desc}</p>
							</div>
							<div class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150 {appState.settings.llm[feat.key] ? 'bg-accent-500' : 'bg-surface-overlay border border-border-default'}">
								<span class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150 {appState.settings.llm[feat.key] ? 'left-[18px]' : 'left-[3px]'}"></span>
							</div>
						</button>
					{/each}

					{#if appState.settings.llm.filterJobs}
						<div class="pt-2">
							<label for="llm-filter-criteria" class="mb-1 block text-[11px] font-medium text-text-secondary">Filter criteria</label>
							<textarea id="llm-filter-criteria" rows="3" placeholder="Example: Remote senior TypeScript roles only" value={appState.settings.llm.filterCriteria} oninput={(e) => handleFilterCriteriaInput((e.target as HTMLTextAreaElement).value)} class="w-full resize-none rounded-md border border-border-default bg-surface-overlay px-3 py-2 text-[12px] text-text-primary placeholder:text-text-faint focus:border-accent-500 focus:outline-none"></textarea>
						</div>
					{/if}
				</div>
			</section>
		{:else}
			<div class="space-y-6">
				<section>
					<h3 class="mb-3 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Automation</h3>
					<button type="button" class="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-overlay px-4 py-3 text-left transition-colors duration-150 hover:border-border-default focus-visible:outline-none" onclick={() => saveSettingsPatch({ advanced: { browserVisible: !appState.settings.advanced.browserVisible } })}>
						<div class="flex items-center gap-3">
							{#if appState.settings.advanced.browserVisible}
								<Eye size={15} strokeWidth={1.75} class="flex-shrink-0 text-accent-500" aria-hidden="true" />
							{:else}
								<EyeOff size={15} strokeWidth={1.75} class="flex-shrink-0 text-text-faint" aria-hidden="true" />
							{/if}
							<div>
								<p class="text-[12px] font-medium text-text-primary">Show browser during automation</p>
								<p class="text-[11px] text-text-faint">{appState.settings.advanced.browserVisible ? 'Window visible' : 'Browser runs in the background'}</p>
							</div>
						</div>
						<div class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150 {appState.settings.advanced.browserVisible ? 'bg-accent-500' : 'bg-surface-overlay border border-border-default'}">
							<span class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150 {appState.settings.advanced.browserVisible ? 'left-[18px]' : 'left-[3px]'}"></span>
						</div>
					</button>

					<div class="mt-4 grid gap-4 sm:grid-cols-3">
						<div>
							<h4 class="mb-1 text-[12px] font-medium text-text-primary">Search language</h4>
							<div class="flex overflow-hidden rounded-lg border border-border-default">
								{#each [{ value: 'pt-BR', label: 'PT-BR' }, { value: 'en-US', label: 'EN-US' }] as opt (opt.value)}
									<button type="button" class="flex-1 cursor-pointer px-3 py-2 text-[12px] font-medium transition-colors duration-100 focus-visible:outline-none {appState.settings.advanced.searchLocale === opt.value ? 'bg-accent-500 text-surface-base' : 'bg-surface-overlay text-text-muted hover:bg-surface-hover'}" onclick={() => saveSettingsPatch({ advanced: { searchLocale: opt.value as 'pt-BR' | 'en-US' } })}>{opt.label}</button>
								{/each}
							</div>
						</div>

						<div>
							<label class="mb-1 block text-[12px] font-medium text-text-primary" for="cycle-max">Max cycle (min)</label>
							<input id="cycle-max" type="number" min="1" class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none" value={Math.round(appState.settings.advanced.cycleMaxMs / 60_000)} oninput={(e) => setAdvancedNumber('cycleMaxMs', (e.target as HTMLInputElement).value)} />
						</div>

						<div>
							<label class="mb-1 block text-[12px] font-medium text-text-primary" for="interval-ms">Interval (min)</label>
							<input id="interval-ms" type="number" min="1" class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none" value={Math.round(appState.settings.advanced.intervalMs / 60_000)} oninput={(e) => setAdvancedNumber('intervalMs', (e.target as HTMLInputElement).value)} />
						</div>
					</div>
				</section>

				<section>
					<h3 class="mb-3 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Danger zone</h3>
					<div class="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-overlay px-4 py-3">
						<div>
							<p class="text-[12px] font-medium text-text-primary">Clear all jobs and applications</p>
							<p class="text-[11px] text-text-faint">Resumes, settings, and execution history are kept.</p>
						</div>
						<button type="button" class="h-8 cursor-pointer flex-shrink-0 rounded-md border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none {clearConfirming ? 'border-[#ef4444] bg-[#1c0a0a] text-[#ef4444] hover:bg-[#2a0f0f]' : 'border-border-default bg-surface-overlay text-[#ef4444] hover:border-[#ef4444]'}" onclick={handleClearDatabase}>
							<Trash2 size={13} class="mr-1.5 inline-block" aria-hidden="true" />
							{clearConfirming ? 'Confirm?' : 'Clear'}
						</button>
					</div>
				</section>
			</div>
		{/if}
</div>
</div>

{#if providersModalOpen}
	<ProvidersModal onClose={() => { providersModalOpen = false; refreshLlmSettings(); }} />
{/if}

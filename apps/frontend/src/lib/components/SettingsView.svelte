<script lang="ts">
	import Bell from '@lucide/svelte/icons/bell';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import FileText from '@lucide/svelte/icons/file-text';
	import Plus from '@lucide/svelte/icons/plus';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Upload from '@lucide/svelte/icons/upload';
	import X from '@lucide/svelte/icons/x';
	import { onDestroy, onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import * as api from '$lib/api';
	import type { ProviderInfo } from '$lib/api';
	import type {
		AppSettings,
		DiscoverConfig,
		LlmSettings,
		ScheduleDay,
		ScheduleSettings,
		TelegramStatus
	} from '$lib/types';
	import { appState } from '$lib/state.svelte';
	import { toastState } from '$lib/toast.svelte';
	import { trapFocus } from '$lib/focusTrap';
	import { modalTransition } from '$lib/transitions';
	import ProvidersModal from './ProvidersModal.svelte';
	import YamlEditor from './YamlEditor.svelte';

	type Tab = 'geral' | 'ia' | 'avancado';
	type SettingsPatch = Partial<{
		general: Omit<Partial<AppSettings['general']>, 'execution'> & {
			execution?: Partial<DiscoverConfig>;
		};
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

	const tabs: { id: Tab; label: string }[] = [
		{ id: 'geral', label: 'General' },
		{ id: 'ia', label: 'AI' },
		{ id: 'avancado', label: 'Advanced' }
	];

	const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
	const TIMEZONES = [
		'America/Sao_Paulo',
		'America/New_York',
		'America/Chicago',
		'America/Los_Angeles',
		'Europe/London',
		'Europe/Lisbon',
		'Europe/Paris',
		'UTC'
	];

	let activeTab = $state<Tab>('geral');
	let configuredProviders = $state<ProviderInfo[]>([]);
	let providersModalOpen = $state(false);
	let scheduleModalOpen = $state(false);
	let clearConfirming = $state(false);
	let telegramStatus = $state<TelegramStatus | null>(null);
	let telegramPairingCode = $state<string | null>(null);
	let settingsDebounce: ReturnType<typeof setTimeout> | null = null;
	let pendingSettingsPatch: SettingsPatch = {};
	let filterCriteriaDebounce: ReturnType<typeof setTimeout> | null = null;
	let tailoringInstructionsDebounce: ReturnType<typeof setTimeout> | null = null;
	let blockedKeywordInput = $state('');
	let blockedCompanyInput = $state('');
	let masters = $state<string[]>([]);
	let selectedMaster = $state('');
	let masterYaml = $state('');
	let masterIssues = $state<api.ResumeIssue[]>([]);
	let masterStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let masterExtracting = $state(false);
	let newMasterName = $state('');
	let addingMaster = $state(false);
	let extractMenuOpen = $state(false);
	let masterSaveTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingMasterSave: { name: string; yaml: string } | null = null;
	let masterTabs = $derived(
		selectedMaster && !masters.includes(selectedMaster) ? [...masters, selectedMaster] : masters
	);
	let masterStatusText = $derived(
		masterStatus === 'saving'
			? 'Saving changes…'
			: masterStatus === 'saved'
				? 'Saved'
				: masterStatus === 'error'
					? 'Fix YAML to save'
					: ''
	);
	const MASTER_TEMPLATE =
		'meta:\n  template: default\n  locale: en\nbasics:\n  name: New Resume\nwork: []\nskills: []\n';

	$effect(() => {
		if (appState.resumes.length === 0) extractMenuOpen = false;
	});

	function normalizeMasterName(name: string): string {
		const cleaned = name.trim().replace(/[^A-Za-z0-9 _-]+/g, '').replace(/\s+/g, '-');
		return cleaned.length > 0 ? cleaned : 'master';
	}

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
		loadMasters();
		loadTelegram();
	});

	onDestroy(() => {
		void flushMasterSave();
	});

	async function loadMasters() {
		try {
			const { masters: list } = await api.listMasters();
			masters = list;
			if (list.length > 0 && !list.includes(selectedMaster)) {
				await openMaster(list[0]);
			} else if (list.length === 0) {
				selectedMaster = '';
				masterYaml = '';
			}
		} catch {
			toastState.show('Failed to load master resumes', 'error');
		}
	}

	async function openMaster(name: string) {
		await flushMasterSave();
		selectedMaster = name;
		masterIssues = [];
		masterStatus = 'idle';
		addingMaster = false;
		extractMenuOpen = false;
		if (!masters.includes(name)) {
			masterYaml = MASTER_TEMPLATE;
			return;
		}
		try {
			const { yaml } = await api.getMaster(name);
			masterYaml = yaml ?? '';
		} catch {
			toastState.show('Failed to load master resume', 'error');
		}
	}

	function startNewMaster() {
		addingMaster = true;
		newMasterName = '';
		extractMenuOpen = false;
	}

	async function confirmNewMaster() {
		const name = normalizeMasterName(newMasterName);
		if (!name) return;
		await flushMasterSave();
		addingMaster = false;
		if (masters.includes(name)) {
			await openMaster(name);
			return;
		}
		selectedMaster = name;
		masterYaml = MASTER_TEMPLATE;
		masterIssues = [];
		await doSaveMaster(name, masterYaml);
	}

	function scheduleMasterSave() {
		if (!selectedMaster) return;
		pendingMasterSave = { name: selectedMaster, yaml: masterYaml };
		masterStatus = 'saving';
		if (masterSaveTimer) clearTimeout(masterSaveTimer);
		masterSaveTimer = setTimeout(() => void flushMasterSave(), 700);
	}

	async function flushMasterSave() {
		if (masterSaveTimer) {
			clearTimeout(masterSaveTimer);
			masterSaveTimer = null;
		}
		const p = pendingMasterSave;
		pendingMasterSave = null;
		if (p) await doSaveMaster(p.name, p.yaml);
	}

	function cancelPendingMasterSave(name: string) {
		if (pendingMasterSave?.name !== name) return;
		if (masterSaveTimer) {
			clearTimeout(masterSaveTimer);
			masterSaveTimer = null;
		}
		pendingMasterSave = null;
	}

	async function doSaveMaster(name: string, yaml: string) {
		try {
			const res = await api.saveMaster(name, yaml);
			const current = name === selectedMaster;
			if ('issues' in res) {
				if (current) {
					masterIssues = res.issues;
					masterStatus = 'error';
				}
			} else {
				if (!masters.includes(name)) masters = [...masters, name].sort();
				if (current) {
					masterIssues = [];
					masterStatus = 'saved';
				}
			}
		} catch {
			if (name === selectedMaster) masterStatus = 'error';
			toastState.show('Failed to save master resume', 'error');
		}
	}

	async function extractMaster(source: string) {
		if (!selectedMaster) return;
		if (!source) return;
		extractMenuOpen = false;
		cancelPendingMasterSave(selectedMaster);
		masterExtracting = true;
		masterIssues = [];
		try {
			const { yaml } = await api.extractMaster(selectedMaster, source);
			masterYaml = yaml;
			masterStatus = 'saved';
			if (!masters.includes(selectedMaster)) masters = [...masters, selectedMaster].sort();
			toastState.show('Draft generated from PDF', 'success');
		} catch {
			toastState.show('Failed to generate from PDF', 'error');
		} finally {
			masterExtracting = false;
		}
	}

	async function removeMaster() {
		if (!selectedMaster) return;
		await flushMasterSave();
		extractMenuOpen = false;
		try {
			await api.deleteMaster(selectedMaster);
			toastState.show(`Removed ${selectedMaster}`, 'success');
			selectedMaster = '';
			await loadMasters();
		} catch {
			toastState.show('Failed to remove master resume', 'error');
		}
	}

	async function handleLlmSetting(update: Partial<LlmSettings>) {
		try {
			const llm = await api.updateLlmSettings(update);
			appState.settings = { ...appState.settings, llm };
		} catch {
			toastState.show('Failed to save AI setting', 'error');
		}
	}

	let activeProvider = $derived(
		configuredProviders.find((p) => p.id === appState.settings.llm.provider)
	);
	let activeModels = $derived(activeProvider?.models ?? []);

	function selectProvider(id: string) {
		const provider = configuredProviders.find((p) => p.id === id);
		const model = provider?.models[0]?.id ?? appState.settings.llm.model;
		handleLlmSetting({ provider: id, model });
	}

	function handleFilterCriteriaInput(value: string) {
		appState.settings = {
			...appState.settings,
			llm: { ...appState.settings.llm, filterCriteria: value }
		};
		if (filterCriteriaDebounce !== null) clearTimeout(filterCriteriaDebounce);
		filterCriteriaDebounce = setTimeout(() => {
			handleLlmSetting({ filterCriteria: value });
		}, 600);
	}

	function handleTailoringInstructionsInput(value: string) {
		appState.settings = {
			...appState.settings,
			llm: { ...appState.settings.llm, resumeTailoringInstructions: value }
		};
		if (tailoringInstructionsDebounce !== null) clearTimeout(tailoringInstructionsDebounce);
		tailoringInstructionsDebounce = setTimeout(() => {
			handleLlmSetting({ resumeTailoringInstructions: value });
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
		if (!list.includes(val))
			scheduleSettingsPatch({ general: { blockedKeywords: [...list, val] } });
		blockedKeywordInput = '';
	}

	function removeBlockedKeyword(kw: string) {
		scheduleSettingsPatch({
			general: {
				blockedKeywords: (appState.settings.general.blockedKeywords ?? []).filter((k) => k !== kw)
			}
		});
	}

	function addBlockedCompany() {
		const val = blockedCompanyInput.trim();
		if (!val) return;
		const list = appState.settings.general.blockedCompanies ?? [];
		if (!list.includes(val))
			scheduleSettingsPatch({ general: { blockedCompanies: [...list, val] } });
		blockedCompanyInput = '';
	}

	function removeBlockedCompany(co: string) {
		scheduleSettingsPatch({
			general: {
				blockedCompanies: (appState.settings.general.blockedCompanies ?? []).filter((c) => c !== co)
			}
		});
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

	function setExternalApplyConcurrency(value: string) {
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		scheduleSettingsPatch({
			advanced: { externalApplyConcurrency: Math.max(1, Math.min(4, Math.round(n))) }
		});
	}

	async function loadTelegram() {
		try {
			telegramStatus = await api.getTelegramStatus();
		} catch {
			toastState.show('Failed to load Telegram status', 'error');
		}
	}

	async function saveTelegram(enabled: boolean, botToken: string) {
		const telegram = { ...appState.settings.advanced.telegram, enabled, botToken };
		await saveSettingsPatch({ advanced: { telegram } });
		await loadTelegram();
	}

	function setTelegramEnabled(enabled: boolean) {
		saveTelegram(enabled, appState.settings.advanced.telegram.botToken);
	}

	function setTelegramToken(botToken: string) {
		saveTelegram(appState.settings.advanced.telegram.enabled, botToken);
	}

	async function pairTelegram() {
		try {
			const code = (await api.startTelegramPairing()).code;
			telegramPairingCode = code;
			try {
				await navigator.clipboard.writeText(`/start ${code}`);
				toastState.show('Telegram pairing command copied', 'success');
			} catch {
				toastState.show('Pairing started, but clipboard copy failed', 'error');
			}
		} catch {
			toastState.show('Failed to start pairing', 'error');
		}
	}

	let schedule = $derived(appState.settings.advanced.schedule);
	let scheduleActiveDays = $derived(schedule.days.filter((d) => d.enabled).length);
	let scheduleHasInvalid = $derived(schedule.days.some((d) => d.enabled && d.start >= d.end));
	let scheduleSummary = $derived(
		schedule.enabled
			? scheduleActiveDays > 0
				? scheduleWindowSummary()
				: 'No active windows yet'
			: 'Runs whenever execution is started'
	);

	function formatDayRange(): string {
		const active = schedule.days.map((day, i) => (day.enabled ? i : -1)).filter((i) => i >= 0);
		if (active.length === 0) return 'No days selected';
		if (active.length === 7) return 'Every day';
		if (active.join(',') === '0,1,2,3,4') return 'Mon to Fri';
		if (active.join(',') === '5,6') return 'Weekend';
		return active.map((i) => DAY_LABELS[i]).join(', ');
	}

	function scheduleWindowSummary(): string {
		const activeDays = schedule.days.filter((day) => day.enabled);
		const uniformWindow = activeDays.every(
			(day) => day.start === activeDays[0]?.start && day.end === activeDays[0]?.end
		);
		const window = uniformWindow ? `${activeDays[0].start} to ${activeDays[0].end}` : 'mixed hours';
		return `${formatDayRange()}, ${window}`;
	}

	function patchSchedule(next: ScheduleSettings) {
		scheduleSettingsPatch({ advanced: { schedule: next } });
	}

	function setScheduleEnabled(enabled: boolean) {
		patchSchedule({ ...schedule, enabled });
	}

	function setScheduleTimezone(timezone: string) {
		patchSchedule({ ...schedule, timezone });
	}

	function setScheduleDay(index: number, change: Partial<ScheduleDay>) {
		const days = schedule.days.map((d, i) => (i === index ? { ...d, ...change } : d));
		patchSchedule({ ...schedule, days });
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
			appState.settings = mergeSettings(appState.settings, {
				general: { defaultResume: filename }
			});
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
	<div class="mx-auto max-w-2xl p-4 md:p-6">
		<div class="mb-6">
			<div>
				<h2 class="text-base leading-tight font-semibold text-text-primary">Settings</h2>
			</div>

			<div
				class="mt-4 flex gap-1 rounded-lg border border-border-subtle bg-surface-sidebar p-1"
				role="tablist"
				aria-label="Settings sections"
			>
				{#each tabs as tab (tab.id)}
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === tab.id}
						class="min-w-0 flex-1 cursor-pointer rounded-md px-3 py-2 text-center transition-colors duration-150 focus-visible:outline-none {activeTab ===
						tab.id
							? 'bg-surface-hover text-text-primary shadow-[inset_0_0_0_1px_var(--color-border-default)]'
							: 'text-text-muted hover:bg-surface-overlay hover:text-text-secondary'}"
						onclick={() => {
							activeTab = tab.id;
						}}
					>
						<span class="block truncate text-[12px] font-semibold">{tab.label}</span>
					</button>
				{/each}
			</div>
		</div>

		{#if activeTab === 'geral'}
			<div>
				<section class="mb-6">
					<div class="mb-4">
						<h3 class="text-[13px] font-semibold text-text-primary">Execution profile</h3>
						<p class="mt-1 text-[11px] text-text-faint">
							These filters are used directly by the “Start execution” button.
						</p>
					</div>

					<div class="space-y-4">
						<div>
							<label
								class="mb-1.5 block text-[11px] font-medium text-text-secondary"
								for="settings-keywords">Keywords</label
							>
							<textarea
								id="settings-keywords"
								class="min-h-19 w-full resize-none rounded-md border border-border-default bg-surface-overlay px-3 py-2 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
								placeholder="Software Engineer&#10;Python Developer"
								value={appState.settings.general.execution.keywords ?? ''}
								oninput={(e) =>
									setExecution({ keywords: (e.target as HTMLTextAreaElement).value || undefined })}
							></textarea>
							<p class="mt-1 text-[10px] text-text-faint">Required. One keyword per line.</p>
						</div>

						<div class="grid gap-3 sm:grid-cols-2">
							<div>
								<label
									class="mb-1.5 block text-[11px] font-medium text-text-secondary"
									for="settings-location">Location</label
								>
								<input
									id="settings-location"
									type="text"
									class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary placeholder:text-text-placeholder focus:border-border-strong focus:outline-none"
									placeholder="Brasil"
									value={appState.settings.general.execution.location ?? ''}
									oninput={(e) =>
										setExecution({ location: (e.target as HTMLInputElement).value || undefined })}
								/>
							</div>

							<div>
								<label
									class="mb-1.5 block text-[11px] font-medium text-text-secondary"
									for="settings-max-jobs">Max jobs</label
								>
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
								<label
									class="mb-1.5 block text-[11px] font-medium text-text-secondary"
									for="settings-work-type">Work model</label
								>
								<select
									id="settings-work-type"
									class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
									value={appState.settings.general.execution.workType ?? ''}
									onchange={(e) =>
										setExecution({ workType: (e.target as HTMLSelectElement).value || undefined })}
								>
									{#each WORK_TYPES as opt (opt.value)}<option value={opt.value}>{opt.label}</option
										>{/each}
								</select>
							</div>

							<div>
								<label
									class="mb-1.5 block text-[11px] font-medium text-text-secondary"
									for="settings-date-posted">Posted</label
								>
								<select
									id="settings-date-posted"
									class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
									value={appState.settings.general.execution.datePosted ?? ''}
									onchange={(e) =>
										setExecution({
											datePosted: (e.target as HTMLSelectElement).value || undefined
										})}
								>
									{#each DATE_POSTED as opt (opt.value)}<option value={opt.value}
											>{opt.label}</option
										>{/each}
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
											checked={(appState.settings.general.execution.experienceLevel ?? []).includes(
												level.value
											)}
											onchange={() =>
												setExecution({
													experienceLevel: toggle(
														appState.settings.general.execution.experienceLevel,
														level.value
													)
												})}
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
											checked={(appState.settings.general.execution.jobType ?? []).includes(
												jtype.value
											)}
											onchange={() =>
												setExecution({
													jobType: toggle(appState.settings.general.execution.jobType, jtype.value)
												})}
										/>
										<span class="text-[12px] text-text-muted">{jtype.label}</span>
									</label>
								{/each}
							</div>
						</div>

						<div class="space-y-2">
							{#each [{ key: 'easyApply', label: 'Easy Apply only', desc: 'Only jobs with simplified applications' }, { key: 'under10Applicants', label: 'Under 10 applicants', desc: 'Only jobs with lower competition' }, { key: 'inMyNetwork', label: 'In my network', desc: 'Only jobs at companies in your network' }] as opt (opt.key)}
								<button
									type="button"
									class="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-left transition-colors duration-150 hover:border-border-default focus-visible:outline-none"
									onclick={() =>
										setExecutionOption(
											opt.key,
											!(appState.settings.general.execution.options?.[opt.key] as boolean)
										)}
								>
									<div>
										<p class="text-[12px] font-medium text-text-primary">{opt.label}</p>
										<p class="text-[10px] text-text-faint">{opt.desc}</p>
									</div>
									<div
										class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150 {(appState
											.settings.general.execution.options?.[opt.key] as boolean)
											? 'bg-accent-500'
											: 'border border-border-default bg-surface-overlay'}"
									>
										<span
											class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150 {(appState
												.settings.general.execution.options?.[opt.key] as boolean)
												? 'left-[18px]'
												: 'left-[3px]'}"
										></span>
									</div>
								</button>
							{/each}
						</div>
					</div>
				</section>

				<section class="mb-6">
					<div class="mb-4">
						<h3 class="text-[13px] font-semibold text-text-primary">Static filters</h3>
						<p class="mt-1 text-[11px] text-text-faint">
							Jobs matching these are automatically rejected, regardless of AI settings.
						</p>
					</div>

					<div class="space-y-4">
						{#snippet tagInput(
							label: string,
							desc: string,
							tags: string[],
							inputVal: string,
							onInput: (v: string) => void,
							onAdd: () => void,
							onRemove: (v: string) => void,
							onKeydown: (e: KeyboardEvent) => void
						)}
							<div>
								<p class="mb-1 text-[11px] font-medium text-text-secondary">{label}</p>
								<p class="mb-2 text-[10px] text-text-faint">{desc}</p>
								{#if tags.length > 0}
									<div class="mb-2 flex flex-wrap gap-1.5">
										{#each tags as tag (tag)}
											<span
												class="flex items-center gap-1 rounded-md border border-border-default bg-surface-overlay px-2 py-0.5 text-[11px] text-text-secondary"
											>
												{tag}
												<button
													type="button"
													class="cursor-pointer text-text-faint transition-colors duration-100 hover:text-text-primary focus-visible:outline-none"
													onclick={() => onRemove(tag)}
													aria-label="Remove {tag}">×</button
												>
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
									<button
										type="button"
										class="h-7 cursor-pointer rounded-md border border-border-default bg-surface-overlay px-3 text-[11px] font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary focus-visible:outline-none"
										onclick={onAdd}>Add</button
									>
								</div>
							</div>
						{/snippet}

						{@render tagInput(
							'Blocked keywords',
							'Matches job title, description, and skills (whole word, case-insensitive).',
							appState.settings.general.blockedKeywords ?? [],
							blockedKeywordInput,
							(v) => {
								blockedKeywordInput = v;
							},
							addBlockedKeyword,
							removeBlockedKeyword,
							(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									addBlockedKeyword();
								}
							}
						)}

						{@render tagInput(
							'Blocked companies',
							'Matches the company name that posted the job.',
							appState.settings.general.blockedCompanies ?? [],
							blockedCompanyInput,
							(v) => {
								blockedCompanyInput = v;
							},
							addBlockedCompany,
							removeBlockedCompany,
							(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									addBlockedCompany();
								}
							}
						)}
					</div>
				</section>

				<section class="mb-6">
					<div class="mb-3 flex items-center justify-between">
						<div>
							<h3 class="text-[13px] font-semibold text-text-primary">Resumes</h3>
							<p class="mt-1 text-[11px] text-text-faint">Required to start execution.</p>
						</div>
						<label
							class="flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border-default bg-surface-overlay px-2.5 text-[11px] font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary"
						>
							<Upload size={11} aria-hidden="true" />
							Upload
							<input type="file" class="sr-only" accept=".pdf" onchange={handleUpload} />
						</label>
					</div>

					{#if appState.resumes.length === 0}
						<div
							class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-subtle py-10 text-center"
						>
							<FileText size={24} strokeWidth={1.5} class="text-text-faint" aria-hidden="true" />
							<p class="text-[11px] text-text-faint">No resumes uploaded</p>
						</div>
					{:else}
						<div class="space-y-1.5">
							{#each appState.resumes as filename (filename)}
								<div
									class="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-overlay px-3 py-2.5"
								>
									<div class="flex min-w-0 flex-1 items-center gap-2">
										<FileText
											size={13}
											strokeWidth={1.75}
											class="flex-shrink-0 text-text-faint"
											aria-hidden="true"
										/>
										<span class="min-w-0 flex-1 truncate text-[12px] text-text-primary"
											>{filename}</span
										>
									</div>
									<div class="flex flex-shrink-0 items-center gap-3">
										{#if appState.defaultResume === filename}
											<span class="text-[10px] font-bold text-success-500">DEFAULT</span>
										{:else}
											<button
												type="button"
												class="cursor-pointer text-[10px] font-medium text-text-faint transition-colors duration-150 hover:text-text-muted focus-visible:outline-none"
												onclick={() => handleSetDefault(filename)}>Set default</button
											>
										{/if}
										<button
											type="button"
											class="cursor-pointer text-[10px] font-medium text-danger-600 transition-colors duration-150 hover:text-danger-700 focus-visible:outline-none"
											onclick={() => handleDelete(filename)}>Remove</button
										>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</section>
				<section class="mb-6">
					<div class="mb-3">
						<div>
							<h3 class="text-[13px] font-semibold text-text-primary">Master resumes</h3>
							<p class="mt-1 text-[11px] text-text-faint">
								Structured sources the AI tailors per job. The best-fitting one is auto-selected.
							</p>
						</div>

						<div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
							{#if masterTabs.length > 0}
								<label class="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-xs sm:flex-row sm:items-center">
									<span class="text-[10px] font-medium whitespace-nowrap text-text-faint">Master</span>
									<select
										aria-label="Master resume"
										value={selectedMaster}
										class="h-7 w-full min-w-0 cursor-pointer rounded-md border border-border-default bg-surface-overlay px-2 text-[11px] text-text-muted transition-colors duration-150 hover:border-border-strong focus:border-border-strong focus:outline-none"
										onchange={(e) => openMaster((e.currentTarget as HTMLSelectElement).value)}
									>
										{#each masterTabs as name (name)}
											<option value={name}>{name}{!masters.includes(name) ? ' (unsaved)' : ''}</option>
										{/each}
									</select>
								</label>
							{/if}
						{#if addingMaster}
							<div class="flex min-w-0 gap-1.5">
								<input
									type="text"
									class="h-7 min-w-0 flex-1 rounded-md border border-border-strong bg-surface-overlay px-2 text-[11px] text-text-primary placeholder:text-text-placeholder focus:outline-none sm:w-32 sm:flex-none"
									placeholder="Name…"
									bind:value={newMasterName}
									onkeydown={(e) => {
										if (e.key === 'Enter') {
											e.preventDefault();
											confirmNewMaster();
										}
										if (e.key === 'Escape') addingMaster = false;
									}}
								/>
								<button
									type="button"
									class="h-7 cursor-pointer rounded-md border border-border-default bg-surface-overlay px-2.5 text-[11px] font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary focus-visible:outline-none"
									onclick={confirmNewMaster}>Add</button
								>
							</div>
						{:else}
							<button
								type="button"
								class="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-dashed border-border-default px-2.5 text-[11px] font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary focus-visible:outline-none"
								onclick={startNewMaster}
						>
								<Plus size={11} aria-hidden="true" /> New
							</button>
						{/if}

							{#if selectedMaster}
								<div class="flex min-w-0 flex-col gap-2 sm:ml-auto sm:flex-row sm:items-center">
									{#if masterStatusText}
										<span
											aria-live="polite"
											class="text-[10px] font-medium whitespace-nowrap {masterStatus === 'saved'
												? 'text-success-500'
												: masterStatus === 'error'
													? 'text-danger-600'
													: 'text-text-faint'}"
										>
											{masterStatusText}
										</span>
									{/if}
									<div class="relative w-full sm:w-auto">
										<button
											type="button"
											disabled={appState.resumes.length === 0 || masterExtracting}
											aria-haspopup="menu"
											aria-expanded={extractMenuOpen}
											title={appState.resumes.length === 0 ? 'Upload a PDF first' : 'Choose a PDF to generate from'}
											class="flex h-7 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border-default bg-surface-overlay px-2.5 text-[11px] font-medium whitespace-nowrap text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
											onclick={() => {
												extractMenuOpen = !extractMenuOpen;
											}}
										>
											<Sparkles size={11} aria-hidden="true" />
											{masterExtracting ? 'Generating…' : 'Generate from PDF'}
											<ChevronDown size={11} aria-hidden="true" />
										</button>

										{#if extractMenuOpen && appState.resumes.length > 0}
											<div
												role="menu"
												transition:fly={{ y: -4, duration: 120 }}
												class="z-modal absolute right-0 mt-1 w-full min-w-64 rounded-md border border-border-default bg-surface-raised p-1 shadow-[var(--shadow-modal)] sm:w-80"
											>
												<p class="px-2 py-1 text-[10px] font-medium text-text-faint">Choose source PDF</p>
												{#each appState.resumes as r (r)}
													<button
														type="button"
														role="menuitem"
														title={r}
														class="flex min-h-8 w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-text-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none"
														onclick={() => extractMaster(r)}
													>
														<FileText size={12} class="flex-shrink-0 text-text-faint" aria-hidden="true" />
														<span class="min-w-0 flex-1 truncate">{r}</span>
														{#if appState.defaultResume === r}
															<span class="flex-shrink-0 text-[9px] font-bold text-success-500">DEFAULT</span>
														{/if}
													</button>
												{/each}
											</div>
										{/if}
									</div>
								</div>
							{/if}
						</div>
					</div>

					{#if selectedMaster}
						<YamlEditor
							class="h-72"
							placeholder={'meta:\n  template: default\nbasics:\n  name: Your Name\n  label: Software Engineer\nwork: []'}
							bind:value={masterYaml}
							oninput={scheduleMasterSave}
						/>

						{#if masterIssues.length > 0}
							<div class="mt-2 rounded-md border border-danger-border bg-danger-bg px-3 py-2">
								<p class="mb-1 text-[11px] font-semibold text-danger-500">Validation errors</p>
								<ul class="space-y-0.5">
									{#each masterIssues as issue (issue.path.join('.') + issue.message)}
										<li class="text-[11px] text-danger-500">
											{issue.path.length ? issue.path.join('.') + ': ' : ''}{issue.message}
										</li>
									{/each}
								</ul>
							</div>
						{/if}

						{#if masters.includes(selectedMaster)}
							<button
								type="button"
								class="mt-2 cursor-pointer text-[10px] font-medium text-danger-600 transition-colors duration-150 hover:text-danger-700 focus-visible:outline-none"
								onclick={removeMaster}>Delete “{selectedMaster}”</button
							>
						{/if}
					{:else}
						<div
							class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border-subtle py-10 text-center"
						>
							<FileText size={24} strokeWidth={1.5} class="text-text-faint" aria-hidden="true" />
							<p class="text-[11px] text-text-faint">
								No master resumes yet. Create one with “New”.
							</p>
						</div>
					{/if}
				</section>
			</div>
		{:else if activeTab === 'ia'}
			<section class="mb-6">
				<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div>
						<h3 class="text-[13px] font-semibold text-text-primary">Artificial Intelligence</h3>
						<p class="mt-1 text-[11px] text-text-faint">
							Control provider, model, and automated behaviors.
						</p>
					</div>
					<button
						type="button"
						class="h-8 cursor-pointer rounded-md border border-border-default bg-surface-overlay px-3.5 text-[12px] font-medium text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text-secondary focus-visible:outline-none"
						onclick={() => (providersModalOpen = true)}>Manage providers</button
					>
				</div>

				<div class="mb-4 space-y-3">
					{#if configuredProviders.length === 0}
						<p class="text-[11px] text-text-faint">
							No providers configured. Use “Manage providers” to add one.
						</p>
					{:else}
						{#if !activeProvider}
							<p
								class="rounded-md border border-status-input-border bg-status-input-bg px-3 py-2 text-[11px] text-status-input-text"
							>
								Active provider “{appState.settings.llm.provider}” isn’t configured. Pick a configured
								one below.
							</p>
						{/if}
						<div class="grid gap-3 sm:grid-cols-2">
							<div>
								<label
									class="mb-1.5 block text-[11px] font-medium text-text-secondary"
									for="llm-provider">Active provider</label
								>
								<select
									id="llm-provider"
									class="h-8 w-full cursor-pointer rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
									value={appState.settings.llm.provider}
									onchange={(e) => selectProvider((e.target as HTMLSelectElement).value)}
								>
									{#if !activeProvider}
										<option value={appState.settings.llm.provider}
											>{appState.settings.llm.provider} (not configured)</option
										>
									{/if}
									{#each configuredProviders as p (p.id)}
										<option value={p.id}>{p.name}</option>
									{/each}
								</select>
							</div>
							<div>
								<label
									class="mb-1.5 block text-[11px] font-medium text-text-secondary"
									for="llm-model">Model</label
								>
								<select
									id="llm-model"
									disabled={!activeProvider}
									class="h-8 w-full cursor-pointer rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none disabled:opacity-50"
									value={appState.settings.llm.model}
									onchange={(e) => handleLlmSetting({ model: (e.target as HTMLSelectElement).value })}
								>
									{#if activeModels.length === 0}
										<option value={appState.settings.llm.model}>{appState.settings.llm.model}</option>
									{/if}
									{#each activeModels as m (m.id)}
										<option value={m.id}>{m.label}</option>
									{/each}
								</select>
							</div>
						</div>
					{/if}
				</div>

				<button
					type="button"
					class="mb-2 flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-overlay px-4 py-3 text-left transition-colors duration-150 hover:border-border-default focus-visible:outline-none"
					onclick={() => handleLlmSetting({ enabled: !appState.settings.llm.enabled })}
				>
					<div>
						<p class="text-[12px] font-medium text-text-primary">Enable AI</p>
						<p class="text-[11px] text-text-faint">
							{appState.settings.llm.enabled ? 'AI enabled' : 'AI disabled'}
						</p>
					</div>
					<div
						class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150 {appState
							.settings.llm.enabled
							? 'bg-accent-500'
							: 'border border-border-default bg-surface-overlay'}"
					>
						<span
							class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150 {appState
								.settings.llm.enabled
								? 'left-[18px]'
								: 'left-[3px]'}"
						></span>
					</div>
				</button>

				<div
					class="space-y-2 {appState.settings.llm.enabled
						? ''
						: 'opacity-50'} transition-opacity duration-150"
				>
					{#each [{ key: 'filterJobs' as const, label: 'Filter jobs', desc: 'Automatically rejects jobs outside your profile' }, { key: 'autoAnswer' as const, label: 'Auto-answer questions', desc: 'Automatically fills application questions' }, { key: 'autoTailorResumes' as const, label: 'Auto-tailor resumes', desc: 'Generates a tailored resume when a job is ready for review' }, { key: 'externalApply' as const, label: 'Apply to external jobs', desc: 'Uses an agent to fill external ATS forms' }] as feat (feat.key)}
						<button
							type="button"
							class="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-overlay px-4 py-3 text-left transition-colors duration-150 hover:border-border-default focus-visible:outline-none"
							onclick={() => handleLlmSetting({ [feat.key]: !appState.settings.llm[feat.key] })}
						>
							<div>
								<p class="text-[12px] font-medium text-text-primary">{feat.label}</p>
								<p class="text-[11px] text-text-faint">{feat.desc}</p>
							</div>
							<div
								class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150 {appState
									.settings.llm[feat.key]
									? 'bg-accent-500'
									: 'border border-border-default bg-surface-overlay'}"
							>
								<span
									class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150 {appState
										.settings.llm[feat.key]
										? 'left-[18px]'
										: 'left-[3px]'}"
								></span>
							</div>
						</button>
					{/each}

					{#if appState.settings.llm.filterJobs}
						<div class="pt-2">
							<label
								for="llm-filter-criteria"
								class="mb-1 block text-[11px] font-medium text-text-secondary"
								>Filter criteria</label
							>
							<textarea
								id="llm-filter-criteria"
								rows="3"
								placeholder="Example: Remote senior TypeScript roles only"
								value={appState.settings.llm.filterCriteria}
								oninput={(e) => handleFilterCriteriaInput((e.target as HTMLTextAreaElement).value)}
								class="w-full resize-none rounded-md border border-border-default bg-surface-overlay px-3 py-2 text-[12px] text-text-primary placeholder:text-text-faint focus:border-accent-500 focus:outline-none"
							></textarea>
						</div>
					{/if}

					{#if appState.settings.llm.autoTailorResumes}
						<div class="pt-2">
							<label
								for="resume-tailoring-instructions"
								class="mb-1 block text-[11px] font-medium text-text-secondary"
								>Resume tailoring instructions</label
							>
							<textarea
								id="resume-tailoring-instructions"
								rows="3"
								placeholder="Example: Emphasize backend APIs, PostgreSQL, and distributed systems. Keep it concise."
								value={appState.settings.llm.resumeTailoringInstructions}
								oninput={(e) =>
									handleTailoringInstructionsInput((e.target as HTMLTextAreaElement).value)}
								class="w-full resize-none rounded-md border border-border-default bg-surface-overlay px-3 py-2 text-[12px] text-text-primary placeholder:text-text-faint focus:border-accent-500 focus:outline-none"
							></textarea>
							<p class="mt-1 text-[10px] text-text-faint">
								Used by auto-tailoring and manual Generate resume actions.
							</p>
						</div>
					{/if}
				</div>
			</section>
		{:else}
			<div class="space-y-6">
				<section>
					<h3 class="mb-3 text-[13px] font-semibold text-text-primary">Automation</h3>
					<button
						type="button"
						class="flex w-full cursor-pointer items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-overlay px-4 py-3 text-left transition-colors duration-150 hover:border-border-default focus-visible:outline-none"
						onclick={() =>
							saveSettingsPatch({
								advanced: { browserVisible: !appState.settings.advanced.browserVisible }
							})}
					>
						<div class="flex items-center gap-3">
							{#if appState.settings.advanced.browserVisible}
								<Eye
									size={15}
									strokeWidth={1.75}
									class="flex-shrink-0 text-accent-500"
									aria-hidden="true"
								/>
							{:else}
								<EyeOff
									size={15}
									strokeWidth={1.75}
									class="flex-shrink-0 text-text-faint"
									aria-hidden="true"
								/>
							{/if}
							<div>
								<p class="text-[12px] font-medium text-text-primary">
									Show browser during automation
								</p>
								<p class="text-[11px] text-text-faint">
									{appState.settings.advanced.browserVisible
										? 'Window visible'
										: 'Browser runs in the background'}
								</p>
							</div>
						</div>
						<div
							class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150 {appState
								.settings.advanced.browserVisible
								? 'bg-accent-500'
								: 'border border-border-default bg-surface-overlay'}"
						>
							<span
								class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150 {appState
									.settings.advanced.browserVisible
									? 'left-[18px]'
									: 'left-[3px]'}"
							></span>
						</div>
					</button>

					<div class="mt-4 grid gap-4 sm:grid-cols-2">
						<div>
							<h4 class="mb-1 text-[12px] font-medium text-text-primary">Search language</h4>
							<div class="flex overflow-hidden rounded-md border border-border-default">
								{#each [{ value: 'pt-BR', label: 'PT-BR' }, { value: 'en-US', label: 'EN-US' }] as opt (opt.value)}
									<button
										type="button"
										class="flex-1 cursor-pointer px-3 py-2 text-[12px] font-medium transition-colors duration-100 focus-visible:outline-none {appState
											.settings.advanced.searchLocale === opt.value
											? 'bg-accent-500 text-surface-base'
											: 'bg-surface-overlay text-text-muted hover:bg-surface-hover'}"
										onclick={() =>
											saveSettingsPatch({
												advanced: { searchLocale: opt.value as 'pt-BR' | 'en-US' }
											})}>{opt.label}</button
									>
								{/each}
							</div>
						</div>

						<div>
							<label class="mb-1 block text-[12px] font-medium text-text-primary" for="cycle-max"
								>Max cycle (min)</label
							>
							<input
								id="cycle-max"
								type="number"
								min="1"
								class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
								value={Math.round(appState.settings.advanced.cycleMaxMs / 60_000)}
								oninput={(e) =>
									setAdvancedNumber('cycleMaxMs', (e.target as HTMLInputElement).value)}
							/>
						</div>

						<div>
							<label class="mb-1 block text-[12px] font-medium text-text-primary" for="interval-ms"
								>Interval (min)</label
							>
							<input
								id="interval-ms"
								type="number"
								min="1"
								class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
								value={Math.round(appState.settings.advanced.intervalMs / 60_000)}
								oninput={(e) =>
									setAdvancedNumber('intervalMs', (e.target as HTMLInputElement).value)}
							/>
						</div>

						<div>
							<label
								class="mb-1 block text-[12px] font-medium text-text-primary"
								for="external-apply-concurrency">External applies at once</label
							>
							<input
								id="external-apply-concurrency"
								type="number"
								min="1"
								max="4"
								class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
								value={appState.settings.advanced.externalApplyConcurrency}
								oninput={(e) =>
									setExternalApplyConcurrency((e.target as HTMLInputElement).value)}
							/>
							<p class="mt-1 text-[11px] text-text-faint">
								Each runs a full browser; higher is faster but uses more RAM.
							</p>
						</div>
					</div>
				</section>

				<section>
					<h3 class="mb-3 text-[13px] font-semibold text-text-primary">Telegram notifications</h3>

					<div
						class="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-overlay px-4 py-3"
					>
						<button
							type="button"
							class="flex w-full cursor-pointer items-center justify-between gap-4 text-left focus-visible:outline-none"
							onclick={() =>
								setTelegramEnabled(!appState.settings.advanced.telegram.enabled)}
						>
							<div class="flex items-center gap-3">
								{#if appState.settings.advanced.telegram.enabled}
									<Bell
										size={15}
										strokeWidth={1.75}
										class="flex-shrink-0 text-accent-500"
										aria-hidden="true"
									/>
								{:else}
									<BellOff
										size={15}
										strokeWidth={1.75}
										class="flex-shrink-0 text-text-faint"
										aria-hidden="true"
									/>
								{/if}
								<div>
									<p class="text-[12px] font-medium text-text-primary">Enable Telegram alerts</p>
									<p class="text-[11px] text-text-faint">
										{appState.settings.advanced.telegram.enabled ? 'Alerts on' : 'Alerts off'}
									</p>
								</div>
							</div>
							<div
								class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150 {appState
									.settings.advanced.telegram.enabled
									? 'bg-accent-500'
									: 'border border-border-default bg-surface-overlay'}"
							>
								<span
									class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150 {appState
										.settings.advanced.telegram.enabled
										? 'left-[18px]'
										: 'left-[3px]'}"
								></span>
							</div>
						</button>

						<div>
							<label
								class="mb-1 block text-[12px] font-medium text-text-primary"
								for="telegram-token">Bot token</label
							>
							<input
								id="telegram-token"
								type="password"
								placeholder="123456:ABC-..."
								class="h-8 w-full rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary focus:border-border-strong focus:outline-none"
								value={appState.settings.advanced.telegram.botToken}
								onchange={(e) => setTelegramToken((e.target as HTMLInputElement).value)}
							/>
							<p class="mt-1 text-[11px] text-text-faint">
								Create a bot with @BotFather and paste its token.
							</p>
						</div>

						<div class="flex items-center justify-between gap-3">
							<p
								class="text-[12px] font-medium {telegramStatus?.paired
									? 'text-success-500'
									: 'text-text-faint'}"
							>
								{telegramStatus?.paired ? 'Paired' : 'Not paired'}
							</p>
							<button
								type="button"
								class="h-8 cursor-pointer rounded-md border border-border-default bg-surface-raised px-3 text-[12px] font-medium text-text-secondary transition-colors duration-150 hover:border-border-strong hover:text-text-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
								disabled={!telegramStatus?.hasToken}
								onclick={pairTelegram}
							>
								{telegramStatus?.paired ? 'Re-pair' : 'Pair'}
							</button>
						</div>

					</div>
				</section>

				<section>
					<h3 class="mb-3 text-[13px] font-semibold text-text-primary">Schedule</h3>

					<div
						class="rounded-lg border border-border-subtle bg-surface-overlay px-4 py-3"
					>
						<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<p class="text-[12px] font-medium text-text-primary">Automation window</p>
								</div>
								<p class="mt-1 max-w-xl text-[12px] leading-snug text-text-faint">
									Choose specific days and times for automation to run.
								</p>
							</div>
							<div class="flex flex-shrink-0 items-center gap-2">
								<button
									type="button"
									class="h-8 cursor-pointer rounded-md border border-border-default bg-surface-raised px-3 text-[12px] font-medium text-text-secondary transition-colors duration-150 hover:border-border-strong hover:text-text-primary focus-visible:outline-none"
									onclick={() => (scheduleModalOpen = true)}
								>
									Edit
								</button>
								<button
									type="button"
									class="relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors duration-150 focus-visible:outline-none {schedule.enabled
										? 'bg-accent-500'
										: 'border border-border-default bg-surface-raised'}"
									aria-label={schedule.enabled ? 'Disable schedule' : 'Enable schedule'}
									aria-pressed={schedule.enabled}
									onclick={() => setScheduleEnabled(!schedule.enabled)}
								>
									<span
										class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150 {schedule.enabled
											? 'left-[18px]'
											: 'left-[3px]'}"
									></span>
								</button>
							</div>
						</div>

						{#if schedule.enabled && (scheduleActiveDays === 0 || scheduleHasInvalid)}
							<p
								class="mt-3 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-[12px] text-danger-500"
							>
								{scheduleActiveDays === 0
									? 'Add at least one run window before relying on scheduled execution.'
									: 'Fix the invalid schedule window before relying on scheduled execution.'}
							</p>
						{/if}
					</div>
				</section>

				<section>
					<h3 class="mb-3 text-[13px] font-semibold text-text-primary">Danger zone</h3>
					<div
						class="flex items-center justify-between gap-4 rounded-lg border border-border-subtle bg-surface-overlay px-4 py-3"
					>
						<div>
							<p class="text-[12px] font-medium text-text-primary">
								Clear all jobs and applications
							</p>
							<p class="text-[11px] text-text-faint">
								Resumes, settings, and execution history are kept.
							</p>
						</div>
						<button
							type="button"
							class="h-8 flex-shrink-0 cursor-pointer rounded-md border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none {clearConfirming
								? 'border-danger-600 bg-danger-bg text-danger-600 hover:bg-danger-bg'
								: 'border-border-default bg-surface-overlay text-danger-600 hover:border-danger-600'}"
							onclick={handleClearDatabase}
						>
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
	<ProvidersModal
		onClose={() => {
			providersModalOpen = false;
			refreshLlmSettings();
		}}
	/>
{/if}

{#if scheduleModalOpen}
	<div class="z-modal fixed inset-0 flex items-start justify-center bg-black/70 p-4">
		<button
			class="absolute inset-0 cursor-default"
			type="button"
			aria-label="Close schedule settings"
			onclick={() => (scheduleModalOpen = false)}
		></button>

		<div
			class="relative z-10 mt-8 flex max-h-[calc(100vh-64px)] w-[min(560px,100%)] flex-col rounded-lg border border-border-default bg-surface-raised shadow-[var(--shadow-modal)]"
			role="dialog"
			aria-modal="true"
			aria-label="Schedule settings"
			tabindex="-1"
			use:trapFocus={{ onEscape: () => (scheduleModalOpen = false) }}
			transition:fly={modalTransition}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div
				class="flex flex-shrink-0 items-center justify-between border-b border-border-subtle px-5 py-4"
			>
				<div>
					<h2 class="text-[13px] font-semibold text-text-primary">Schedule</h2>
					<p class="mt-1 text-[11px] text-text-faint">{scheduleSummary}</p>
				</div>
				<button
					type="button"
					class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-faint transition-colors duration-150 hover:bg-surface-overlay hover:text-text-muted focus-visible:outline-none"
					onclick={() => (scheduleModalOpen = false)}
					aria-label="Close"
				>
					<X size={14} />
				</button>
			</div>

			<div class="flex-1 overflow-y-auto p-4">
				<div class="space-y-3">
					<div>
						<label
							class="mb-1.5 block text-[12px] font-medium text-text-secondary"
							for="schedule-modal-tz">Time zone</label
						>
						<select
							id="schedule-modal-tz"
							class="h-9 w-full cursor-pointer rounded-md border border-border-default bg-surface-overlay px-2.5 text-[12px] text-text-primary transition-colors duration-150 focus:border-border-strong focus:outline-none"
							value={schedule.timezone}
							onchange={(e) => setScheduleTimezone((e.target as HTMLSelectElement).value)}
						>
							{#each TIMEZONES as tz (tz)}
								<option value={tz}>{tz}</option>
							{/each}
							{#if !TIMEZONES.includes(schedule.timezone)}
								<option value={schedule.timezone}>{schedule.timezone}</option>
							{/if}
						</select>
					</div>
					<div class="min-w-0">
						<div class="overflow-hidden rounded-md border border-border-subtle">
							{#each schedule.days as day, i (i)}
								{@const invalid = day.enabled && day.start >= day.end}
								<div
									class="grid gap-2 border-b border-border-subtle bg-surface-overlay px-3 py-2 last:border-b-0 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center {invalid
										? 'bg-danger-bg/50'
										: ''}"
								>
									<button
										type="button"
										class="flex min-w-0 cursor-pointer items-center gap-2 text-left focus-visible:outline-none"
										aria-pressed={day.enabled}
										onclick={() => setScheduleDay(i, { enabled: !day.enabled })}
									>
										<span
											class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-150 {day.enabled
												? 'bg-accent-500'
												: 'border border-border-default bg-surface-raised'}"
										>
											<span
												class="absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all duration-150 {day.enabled
													? 'left-[18px]'
													: 'left-[3px]'}"
											></span>
										</span>
										<span
											class="truncate text-[13px] font-medium {day.enabled
												? 'text-text-primary'
												: 'text-text-faint'}">{DAY_NAMES[i]}</span
										>
									</button>

									<div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
										<input
											type="time"
											aria-label="{DAY_NAMES[i]} start time"
											class="h-8 min-w-0 rounded-md border bg-surface-raised px-2.5 text-[12px] text-text-primary [color-scheme:dark] transition-colors duration-150 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45 {invalid
												? 'border-danger-600'
												: 'border-border-default focus:border-border-strong'}"
											value={day.start}
											disabled={!day.enabled}
											onchange={(e) =>
												setScheduleDay(i, { start: (e.target as HTMLInputElement).value })}
										/>
										<span
											class="text-center text-[11px] {day.enabled
												? 'text-text-faint'
												: 'text-text-faint/60'}"
										>
											to
										</span>
										<input
											type="time"
											aria-label="{DAY_NAMES[i]} end time"
											class="h-8 min-w-0 rounded-md border bg-surface-raised px-2.5 text-[12px] text-text-primary [color-scheme:dark] transition-colors duration-150 focus:outline-none disabled:cursor-not-allowed disabled:opacity-45 {invalid
												? 'border-danger-600'
												: 'border-border-default focus:border-border-strong'}"
											value={day.end}
											disabled={!day.enabled}
											onchange={(e) =>
												setScheduleDay(i, { end: (e.target as HTMLInputElement).value })}
										/>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>

				{#if schedule.enabled && scheduleActiveDays === 0}
					<p
						class="mt-4 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-[12px] text-danger-500"
					>
						Add at least one run window before relying on scheduled execution.
					</p>
				{:else if scheduleHasInvalid}
					<p
						class="mt-4 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-[12px] text-danger-500"
					>
						Fix the highlighted window. End time must be after start time.
					</p>
				{/if}
			</div>
		</div>
	</div>
{/if}

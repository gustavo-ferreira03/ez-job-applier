import {
	getResumes,
	listJobs,
	getAutoApplyStatus,
	getAppSettings,
	listExecutions,
	getExecutionStatus,
	getExternalApplyStatus
} from './api';
import type {
	AppSettings,
	AutoApplyStatus,
	DiscoverConfig,
	Execution,
	JobSummary,
	ExecutionStatus,
	ExternalApplyStatus
} from './types';

function defaultConfig(): DiscoverConfig {
	return { provider: 'linkedin', options: { easyApply: true } };
}

function defaultSettings(): AppSettings {
	return {
		general: {
			execution: defaultConfig(),
			defaultResume: null,
			blockedKeywords: [],
			blockedCompanies: []
		},
		llm: {
			enabled: false,
			provider: 'anthropic',
			model: 'claude-sonnet-4-6',
			filterJobs: false,
			autoAnswer: false,
			autoTailorResumes: false,
			externalApply: false,
			filterCriteria: '',
			resumeTailoringInstructions: ''
		},
		advanced: {
			browserVisible: false,
			searchLocale: 'pt-BR',
			cycleMaxMs: 3_600_000,
			intervalMs: 14_400_000,
			schedule: {
				enabled: false,
				timezone: 'America/Sao_Paulo',
				days: [
					{ enabled: true, start: '09:00', end: '18:00' },
					{ enabled: true, start: '09:00', end: '18:00' },
					{ enabled: true, start: '09:00', end: '18:00' },
					{ enabled: true, start: '09:00', end: '18:00' },
					{ enabled: true, start: '09:00', end: '18:00' },
					{ enabled: false, start: '09:00', end: '18:00' },
					{ enabled: false, start: '09:00', end: '18:00' }
				]
			}
		}
	};
}

class AppState {
	jobs = $state<JobSummary[]>([]);
	executions = $state<Execution[]>([]);
	autoApply = $state<AutoApplyStatus>({ running: false, applied: 0, failed: 0 });
	execution = $state<ExecutionStatus>({
		active: false,
		running: false,
		paused: false,
		actionNeeded: false,
		nextRunAt: null,
		cycleMaxMs: 3_600_000,
		intervalMs: 14_400_000,
		config: null
	});
	externalApply = $state<ExternalApplyStatus>({
		active: false,
		jobId: null,
		title: null,
		phase: 'idle',
		messages: []
	});
	settings = $state<AppSettings>(defaultSettings());
	resumes = $state<string[]>([]);
	defaultResume = $state<string | null>(null);
	discoverConfig = $state<DiscoverConfig>(defaultConfig());

	private autoApplyTimer: ReturnType<typeof setInterval> | null = null;
	private executionTimer: ReturnType<typeof setInterval> | null = null;
	private backgroundTimer: ReturnType<typeof setInterval> | null = null;
	private externalApplyTimer: ReturnType<typeof setInterval> | null = null;

	async init() {
		try {
			const [jobsRes, resumesRes, autoApplyRes, settingsRes, executionsRes, execRes] =
				await Promise.all([
					listJobs(),
					getResumes(),
					getAutoApplyStatus(),
					getAppSettings(),
					listExecutions(),
					getExecutionStatus()
				]);
			this.jobs = jobsRes.jobs;
			this.resumes = resumesRes.resumes;
			this.defaultResume = resumesRes.default;
			this.autoApply = autoApplyRes;
			this.settings = settingsRes;
			this.executions = executionsRes.executions;
			this.execution = execRes;
			if (autoApplyRes.running) this.startAutoApplyPolling();
			if (execRes.active) this.startExecutionPolling();
			this.startBackgroundPolling();
		} catch (e) {
			console.error('Failed to load state:', e);
		}
	}

	async refreshJobs() {
		try {
			const res = await listJobs();
			this.jobs = res.jobs;
		} catch (e) {
			console.error('Failed to refresh jobs:', e);
		}
	}

	async refreshExecutions() {
		try {
			const res = await listExecutions();
			this.executions = res.executions;
		} catch (e) {
			console.error('Failed to refresh executions:', e);
		}
	}

	startAutoApplyPolling() {
		this.stopAutoApplyPolling();
		this.autoApplyTimer = setInterval(async () => {
			try {
				const status = await getAutoApplyStatus();
				this.autoApply = status;
				if (!status.running) this.stopAutoApplyPolling();
			} catch (e) {
				console.error('Auto-apply poll failed:', e);
			}
		}, 2000);
	}

	stopAutoApplyPolling() {
		if (this.autoApplyTimer !== null) {
			clearInterval(this.autoApplyTimer);
			this.autoApplyTimer = null;
		}
	}

	startExecutionPolling() {
		this.stopExecutionPolling();
		this.executionTimer = setInterval(async () => {
			try {
				this.execution = await getExecutionStatus();
				if (!this.execution.active) this.stopExecutionPolling();
			} catch (e) {
				console.error('Execution poll failed:', e);
			}
		}, 3000);
	}

	stopExecutionPolling() {
		if (this.executionTimer !== null) {
			clearInterval(this.executionTimer);
			this.executionTimer = null;
		}
	}

	async refreshExternalApply() {
		try {
			this.externalApply = await getExternalApplyStatus();
			if (this.externalApply.active) this.startExternalApplyPolling();
			else this.stopExternalApplyPolling();
		} catch (e) {
			console.error('Failed to refresh external-apply status:', e);
		}
	}

	startExternalApplyPolling() {
		if (this.externalApplyTimer !== null) return;
		this.externalApplyTimer = setInterval(async () => {
			try {
				this.externalApply = await getExternalApplyStatus();
				if (!this.externalApply.active) this.stopExternalApplyPolling();
			} catch (e) {
				console.error('External-apply poll failed:', e);
			}
		}, 2000);
	}

	stopExternalApplyPolling() {
		if (this.externalApplyTimer !== null) {
			clearInterval(this.externalApplyTimer);
			this.externalApplyTimer = null;
		}
	}

	startBackgroundPolling() {
		if (this.backgroundTimer !== null) return;
		this.backgroundTimer = setInterval(async () => {
			await this.refreshJobs();
			await this.refreshExecutions();
			await this.refreshExternalApply();
		}, 5000);
	}
}

export const appState = new AppState();

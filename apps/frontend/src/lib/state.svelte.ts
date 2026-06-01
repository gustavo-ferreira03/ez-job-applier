import { getResumes, listJobs, getAutoApplyStatus, getAppSettings, listExecutions, getExecutionStatus } from './api';
import type { AppSettings, AutoApplyStatus, DiscoverConfig, Execution, JobSummary, ExecutionStatus } from './types';

function defaultConfig(): DiscoverConfig {
	return { provider: 'linkedin', options: { easyApply: true } };
}

class AppState {
	jobs = $state<JobSummary[]>([]);
	executions = $state<Execution[]>([]);
	autoApply = $state<AutoApplyStatus>({ running: false, applied: 0, failed: 0 });
	execution = $state<ExecutionStatus>({ active: false, running: false, paused: false, actionNeeded: false, nextRunAt: null, cycleMaxMs: 3_600_000, intervalMs: 14_400_000, config: null });
	settings = $state<AppSettings>({ browserVisible: false, searchLocale: 'pt-BR' });
	resumes = $state<string[]>([]);
	defaultResume = $state<string | null>(null);
	discoverConfig = $state<DiscoverConfig>(defaultConfig());

	private autoApplyTimer: ReturnType<typeof setInterval> | null = null;
	private executionTimer: ReturnType<typeof setInterval> | null = null;
	private backgroundTimer: ReturnType<typeof setInterval> | null = null;

	async init() {
		try {
			const [jobsRes, resumesRes, autoApplyRes, settingsRes, executionsRes, execRes] = await Promise.all([
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

	startBackgroundPolling() {
		if (this.backgroundTimer !== null) return;
		this.backgroundTimer = setInterval(async () => {
			await this.refreshJobs();
			await this.refreshExecutions();
		}, 5000);
	}
}

export const appState = new AppState();

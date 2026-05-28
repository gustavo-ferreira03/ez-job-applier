import { getResumes, listJobs, getDiscovery, getAutoApplyStatus, getAppSettings } from './api';
import type { AppSettings, AutoApplyStatus, DiscoverConfig, DiscoveryJob, JobSummary } from './types';

function defaultConfig(): DiscoverConfig {
	return {
		provider: 'linkedin',
		options: { easyApply: true }
	};
}

class AppState {
	jobs = $state<JobSummary[]>([]);
	discovery = $state<DiscoveryJob | null>(null);
	autoApply = $state<AutoApplyStatus>({ running: false, applied: 0, failed: 0 });
	settings = $state<AppSettings>({ browserVisible: false, searchLocale: 'pt-BR' });
	resumes = $state<string[]>([]);
	defaultResume = $state<string | null>(null);
	discoverConfig = $state<DiscoverConfig>(defaultConfig());

	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private autoApplyTimer: ReturnType<typeof setInterval> | null = null;
	private lastDiscovered = 0;
	private lastApplied = 0;

	async init() {
		try {
			const [jobsRes, resumesRes, autoApplyRes, settingsRes] = await Promise.all([
				listJobs(),
				getResumes(),
				getAutoApplyStatus(),
				getAppSettings()
			]);
			this.jobs = jobsRes.jobs;
			this.resumes = resumesRes.resumes;
			this.defaultResume = resumesRes.default;
			this.autoApply = autoApplyRes;
			this.settings = settingsRes;
			if (autoApplyRes.running) {
				this.startAutoApplyPolling();
			}
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

	// Discovery polling
	startPolling(discoveryId: string) {
		this.stopPolling();
		this.lastDiscovered = this.discovery?.discovered ?? 0;

		this.pollTimer = setInterval(async () => {
			try {
				const updated = await getDiscovery(discoveryId);
				const prev = this.lastDiscovered;
				this.discovery = updated;
				this.lastDiscovered = updated.discovered;

				if (updated.discovered > prev) {
					await this.refreshJobs();
				}

				if (updated.status !== 'running') {
					this.stopPolling();
					await this.refreshJobs();
				}
			} catch (e) {
				console.error('Discovery poll failed:', e);
			}
		}, 2000);
	}

	stopPolling() {
		if (this.pollTimer !== null) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	}

	// Auto-apply polling
	startAutoApplyPolling() {
		this.stopAutoApplyPolling();
		this.lastApplied = this.autoApply.applied;

		this.autoApplyTimer = setInterval(async () => {
			try {
				const status = await getAutoApplyStatus();
				const prev = this.lastApplied;
				this.autoApply = status;
				this.lastApplied = status.applied;

				if (status.applied > prev) {
					await this.refreshJobs();
				}

				if (!status.running) {
					this.stopAutoApplyPolling();
					await this.refreshJobs();
				}
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
}

export const appState = new AppState();

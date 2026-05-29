import { getResumes, listJobs, getDiscovery, getAutoApplyStatus, getAppSettings, listDiscoveries } from './api';
import type { AppSettings, AutoApplyStatus, DiscoverConfig, DiscoveryJob, JobSummary } from './types';

function defaultConfig(): DiscoverConfig {
	return { provider: 'linkedin', options: { easyApply: true } };
}

class AppState {
	jobs = $state<JobSummary[]>([]);
	discoveries = $state<DiscoveryJob[]>([]);
	activeDiscovery = $state<DiscoveryJob | null>(null);
	autoApply = $state<AutoApplyStatus>({ running: false, applied: 0, failed: 0 });
	settings = $state<AppSettings>({ browserVisible: false, searchLocale: 'pt-BR' });
	resumes = $state<string[]>([]);
	defaultResume = $state<string | null>(null);
	discoverConfig = $state<DiscoverConfig>(defaultConfig());

	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private autoApplyTimer: ReturnType<typeof setInterval> | null = null;
	private backgroundTimer: ReturnType<typeof setInterval> | null = null;

	async init() {
		try {
			const [jobsRes, resumesRes, autoApplyRes, settingsRes, discoveriesRes] = await Promise.all([
				listJobs(),
				getResumes(),
				getAutoApplyStatus(),
				getAppSettings(),
				listDiscoveries()
			]);
			this.jobs = jobsRes.jobs;
			this.resumes = resumesRes.resumes;
			this.defaultResume = resumesRes.default;
			this.autoApply = autoApplyRes;
			this.settings = settingsRes;
			this.discoveries = discoveriesRes.discoveries;

			const running = discoveriesRes.discoveries.find((d) => d.status === 'running');
			if (running) {
				this.activeDiscovery = running;
				this.startPolling(running.id);
			}
			if (autoApplyRes.running) this.startAutoApplyPolling();
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

	async refreshDiscoveries() {
		try {
			const res = await listDiscoveries();
			this.discoveries = res.discoveries;
		} catch (e) {
			console.error('Failed to refresh discoveries:', e);
		}
	}

	startPolling(discoveryId: string) {
		this.stopPolling();
		this.pollTimer = setInterval(async () => {
			try {
				const updated = await getDiscovery(discoveryId);
				this.activeDiscovery = updated;
				this.discoveries = this.discoveries.map((d) => (d.id === updated.id ? updated : d));
				if (updated.status !== 'running') {
					this.stopPolling();
					this.activeDiscovery = null;
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

	startBackgroundPolling() {
		if (this.backgroundTimer !== null) return;
		this.backgroundTimer = setInterval(async () => {
			await this.refreshJobs();
			await this.refreshDiscoveries();
		}, 5000);
	}
}

export const appState = new AppState();

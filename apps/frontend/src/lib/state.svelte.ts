import { getResumes, listJobs, getDiscovery } from './api';
import type { DiscoverConfig, DiscoveryJob, JobSummary } from './types';

function defaultConfig(): DiscoverConfig {
	return {
		provider: 'linkedin',
		options: { easyApply: true }
	};
}

class AppState {
	jobs = $state<JobSummary[]>([]);
	discovery = $state<DiscoveryJob | null>(null);
	resumes = $state<string[]>([]);
	defaultResume = $state<string | null>(null);
	discoverConfig = $state<DiscoverConfig>(defaultConfig());

	private pollTimer: ReturnType<typeof setInterval> | null = null;
	private lastDiscovered = 0;

	async init() {
		try {
			const [jobsRes, resumesRes] = await Promise.all([listJobs(), getResumes()]);
			this.jobs = jobsRes.jobs;
			this.resumes = resumesRes.resumes;
			this.defaultResume = resumesRes.default;
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
				console.error('Poll failed:', e);
			}
		}, 2000);
	}

	stopPolling() {
		if (this.pollTimer !== null) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	}
}

export const appState = new AppState();

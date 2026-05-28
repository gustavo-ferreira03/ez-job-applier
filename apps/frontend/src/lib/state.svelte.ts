import { getState, sseUrl } from './api';
import type { JobSummary, RunConfig, StateResponse } from './types';

function defaultConfig(): RunConfig {
	return {
		keywords: '',
		location: null,
		easy_apply: true,
		work_type: null,
		experience_level: [],
		job_type: [],
		date_posted: null,
		include_top_applicant: false,
		max_apply: null,
		fill_skill_gaps: false
	};
}

class AppState {
	jobs = $state<JobSummary[]>([]);
	run = $state<{ running: boolean; worker_running: boolean; current_config: RunConfig | null }>({
		running: false,
		worker_running: false,
		current_config: null
	});
	cvs = $state<string[]>([]);
	config = $state<RunConfig>(defaultConfig());
	defaultCV = $state<string | null>(null);
	processingIds = $state<Set<number>>(new Set());
	connected = $state(false);

	private es: EventSource | null = null;

	async init() {
		try {
			const state: StateResponse = await getState();
			this.jobs = state.jobs;
			this.run = state.run;
			this.cvs = state.cvs;
			const { default_cv, ...runConfig } = state.config;
			this.config = { ...defaultConfig(), ...runConfig };
			this.defaultCV = default_cv ?? null;
		} catch (e) {
			console.error('Failed to load state:', e);
		}
	}

	async refresh() {
		try {
			const state: StateResponse = await getState();
			this.jobs = state.jobs;
			this.run = state.run;
			this.cvs = state.cvs;
		} catch (e) {
			console.error('Failed to refresh state:', e);
		}
	}

	connectSSE() {
		if (this.es) {
			this.es.close();
		}

		const es = new EventSource(sseUrl());
		this.es = es;

		es.onmessage = (e) => {
			try {
				this.handleEvent(JSON.parse(e.data) as Record<string, unknown>);
			} catch {
				// ignore
			}
		};

		es.onerror = () => {
			this.connected = false;
			es.close();
			this.es = null;
			setTimeout(() => this.connectSSE(), 3000);
		};
	}

	private handleEvent(event: Record<string, unknown>) {
		const type = event.type as string;

		switch (type) {
			case 'connected':
				this.connected = true;
				break;

			case 'run_started':
				this.run.running = true;
				break;

			case 'run_finished':
			case 'run_failed':
			case 'run_cancelled':
				this.run.running = false;
				this.refresh();
				break;

			case 'job_discovered':
			case 'application_created':
				this.refresh();
				break;

			case 'application_processing': {
				const appId = event.application_id as number;
				this.processingIds = new Set([...this.processingIds, appId]);
				break;
			}

			case 'application_needs_input':
			case 'application_ready_for_review':
			case 'application_answers_saved':
			case 'application_submit_approved':
			case 'application_submitted':
			case 'application_rejected': {
				const appId = event.application_id as number;
				const next = new Set(this.processingIds);
				next.delete(appId);
				this.processingIds = next;
				this.refresh();
				break;
			}
		}
	}
}

export const appState = new AppState();

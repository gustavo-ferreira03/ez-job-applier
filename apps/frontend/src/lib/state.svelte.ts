import { getCurrentRun, getResumes, listJobs, sseUrl, type RunResponse } from './api';
import type { JobSummary, RunConfig } from './types';

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

function runToState(run: RunResponse | null): {
	running: boolean;
	worker_running: boolean;
	current_config: RunConfig | null;
} {
	if (!run || run.status !== 'running') {
		return { running: false, worker_running: false, current_config: null };
	}
	const c = run.config;
	return {
		running: true,
		worker_running: true,
		current_config: {
			keywords: c.keywords ?? '',
			location: c.location ?? null,
			easy_apply: (c.options?.easyApply as boolean) ?? true,
			work_type: c.workType ?? null,
			experience_level: c.experienceLevel ?? [],
			job_type: c.jobType ?? [],
			date_posted: c.datePosted ?? null,
			include_top_applicant: false,
			max_apply: c.maxJobs ?? null,
			fill_skill_gaps: false
		}
	};
}

const SSE_EVENTS = ['job_found', 'applying', 'result', 'done', 'cancelled', 'error'] as const;

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
	processingIds = $state<Set<string>>(new Set());
	connected = $state(false);

	private es: EventSource | null = null;

	async init() {
		try {
			const [jobsRes, runRes, resumesRes] = await Promise.all([
				listJobs(),
				getCurrentRun(),
				getResumes()
			]);
			this.jobs = jobsRes.jobs;
			this.run = runToState(runRes.run);
			this.cvs = resumesRes.files;
			this.defaultCV = resumesRes.default;
		} catch (e) {
			console.error('Failed to load state:', e);
		}
	}

	async refresh() {
		try {
			const [jobsRes, runRes] = await Promise.all([listJobs(), getCurrentRun()]);
			this.jobs = jobsRes.jobs;
			this.run = runToState(runRes.run);
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

		for (const eventType of SSE_EVENTS) {
			es.addEventListener(eventType, (e: MessageEvent) => {
				try {
					this.handleEvent(JSON.parse(e.data) as Record<string, unknown>);
				} catch {
					// ignore
				}
			});
		}

		es.onopen = () => {
			this.connected = true;
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
			case 'job_found':
				this.refresh();
				break;

			case 'applying': {
				const jobId = event.jobId as string;
				this.processingIds = new Set([...this.processingIds, jobId]);
				break;
			}

			case 'result': {
				const jobId = event.jobId as string;
				const next = new Set(this.processingIds);
				next.delete(jobId);
				this.processingIds = next;
				this.refresh();
				break;
			}

			case 'done':
			case 'cancelled':
				this.run.running = false;
				this.run.worker_running = false;
				this.refresh();
				break;

			case 'error':
				this.run.running = false;
				this.run.worker_running = false;
				this.refresh();
				break;
		}
	}
}

export const appState = new AppState();

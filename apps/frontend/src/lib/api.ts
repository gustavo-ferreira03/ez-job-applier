import { PUBLIC_API_URL } from '$env/static/public';
import type { ApplicationStatus, JobDetail, JobSummary, RunConfig } from './types';

const BASE = PUBLIC_API_URL || 'http://localhost:3000';

async function get<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE}${path}`);
	if (!res.ok) throw new Error(`${res.status} GET ${path}`);
	return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		method: 'POST',
		headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
	if (!res.ok) throw new Error(`${res.status} POST ${path}`);
	return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
	const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
	if (!res.ok) throw new Error(`${res.status} DELETE ${path}`);
	return res.json() as Promise<T>;
}

export function sseUrl() {
	return `${BASE}/events`;
}

export function listJobs(): Promise<{ jobs: JobSummary[] }> {
	return get('/jobs');
}

export function getJob(jobId: string): Promise<JobDetail> {
	return get(`/jobs/${encodeURIComponent(jobId)}`);
}

export type RunResponse = {
	id: string;
	config: {
		provider: string;
		keywords?: string;
		location?: string;
		workType?: string;
		experienceLevel?: string[];
		jobType?: string[];
		datePosted?: string;
		maxJobs?: number;
		options?: Record<string, unknown>;
	};
	status: 'running' | 'done' | 'cancelled' | 'failed';
	stats: {
		discovered: number;
		submitted: number;
		needsInput: number;
		skipped: number;
		failed: number;
		external: number;
	};
	startedAt: string;
	finishedAt?: string;
};

export function getCurrentRun(): Promise<{ run: RunResponse | null }> {
	return get('/runs/current');
}

export function getResumes(): Promise<{ files: string[]; default: string | null }> {
	return get('/resumes');
}

export function startRun(config: RunConfig) {
	return post<{ run: unknown }>('/runs', {
		provider: 'linkedin',
		keywords: config.keywords || undefined,
		location: config.location || undefined,
		workType: config.work_type || undefined,
		experienceLevel: config.experience_level.length ? config.experience_level : undefined,
		jobType: config.job_type.length ? config.job_type : undefined,
		datePosted: config.date_posted || undefined,
		maxJobs: config.max_apply || undefined,
		options: { easyApply: config.easy_apply }
	});
}

export function cancelRun() {
	return del<{ ok: boolean }>('/runs/current');
}

export function submitAnswers(jobId: string, answers: Record<string, string>) {
	return post<{ ok: boolean }>(`/jobs/${encodeURIComponent(jobId)}/answers`, { answers });
}

export function approveApplication(jobId: string, cvFilename: string | null = null) {
	return post<unknown>(`/jobs/${encodeURIComponent(jobId)}/apply`, {
		resumeFilename: cvFilename || undefined
	});
}

export function markApplied(jobId: string) {
	return post<{ ok: boolean }>(`/jobs/${encodeURIComponent(jobId)}/mark-applied`);
}

export function skipApplication(jobId: string) {
	return post<{ ok: boolean }>(`/jobs/${encodeURIComponent(jobId)}/skip`);
}

export async function uploadCV(file: File): Promise<{ filename: string }> {
	const form = new FormData();
	form.append('file', file);
	const res = await fetch(`${BASE}/resumes`, { method: 'POST', body: form });
	if (!res.ok) throw new Error(`${res.status} POST /resumes`);
	return res.json();
}

export function setDefaultCV(filename: string | null) {
	return post<{ ok: boolean }>('/resumes/default', { filename });
}

export function deleteCV(filename: string) {
	return del<{ ok: boolean }>(`/resumes/${encodeURIComponent(filename)}`);
}

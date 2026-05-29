import { PUBLIC_API_URL } from '$env/static/public';
import type { AppSettings, AutoApplyStatus, DiscoverConfig, DiscoveryJob, JobDetail, JobSummary } from './types';

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

// Jobs
export function listJobs(): Promise<{ jobs: JobSummary[] }> {
	return get('/jobs');
}

export function getJob(id: number): Promise<JobDetail> {
	return get(`/jobs/${id}`);
}

// Discoveries
export function startDiscovery(config: DiscoverConfig): Promise<DiscoveryJob> {
	return post('/discoveries', config);
}

export function getDiscovery(id: string): Promise<DiscoveryJob> {
	return get(`/discoveries/${id}`);
}

export function cancelDiscovery(id: string): Promise<{ ok: boolean }> {
	return del(`/discoveries/${id}`);
}

export function listDiscoveries(): Promise<{ discoveries: DiscoveryJob[] }> {
	return get('/discoveries');
}

// Applications
export function getQuestions(jobId: number): Promise<unknown> {
	return post(`/jobs/${jobId}/questions`);
}

export function saveAnswers(jobId: number, answers: Record<string, string>): Promise<{ ok: boolean }> {
	return post(`/jobs/${jobId}/answers`, { answers });
}

export function applyToJob(jobId: number, answers?: Record<string, string>, resumeFilename?: string): Promise<unknown> {
	return post(`/jobs/${jobId}/apply`, { answers, resumeFilename });
}

export function skipJob(jobId: number): Promise<{ ok: boolean }> {
	return post(`/jobs/${jobId}/skip`);
}

// Settings
export function getAppSettings(): Promise<AppSettings> {
	return get('/settings');
}

export function updateAppSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
	const res = fetch(`${BASE}/settings`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(patch)
	});
	return res.then((r) => {
		if (!r.ok) throw new Error(`${r.status} PATCH /settings`);
		return r.json() as Promise<AppSettings>;
	});
}

// Auto-apply
export function getAutoApplyStatus(): Promise<AutoApplyStatus> {
	return get('/auto-apply');
}

export function startAutoApply(): Promise<{ ok: boolean }> {
	return post('/auto-apply/start');
}

export function stopAutoApply(): Promise<{ ok: boolean }> {
	return post('/auto-apply/stop');
}

// Resumes
export function getResumes(): Promise<{ resumes: string[]; default: string | null }> {
	return get('/resumes');
}

export async function uploadResume(file: File): Promise<{ filename: string }> {
	const form = new FormData();
	form.append('file', file);
	const res = await fetch(`${BASE}/resumes`, { method: 'POST', body: form });
	if (!res.ok) throw new Error(`${res.status} POST /resumes`);
	return res.json();
}

export function setDefaultResume(filename: string | null): Promise<{ default: string | null }> {
	return post('/resumes/default', { filename });
}

export function deleteResume(filename: string): Promise<{ ok: boolean }> {
	return del(`/resumes/${encodeURIComponent(filename)}`);
}

// Database
export function clearDatabase(): Promise<{ ok: boolean }> {
	return del('/database');
}

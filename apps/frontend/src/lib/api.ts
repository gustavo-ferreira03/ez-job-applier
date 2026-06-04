import { PUBLIC_API_URL } from '$env/static/public';
import type { AppSettings, ApplicationStatus, AutoApplyStatus, DiscoverConfig, Execution, JobDetail, JobSummary, ExecutionStatus, LlmSettings } from './types';

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

async function put<T>(path: string, body: unknown): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!res.ok) throw new Error(`${res.status} PUT ${path}`);
	return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
	const res = await fetch(`${BASE}${path}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	if (!res.ok) throw new Error(`${res.status} PATCH ${path}`);
	return res.json() as Promise<T>;
}

// Jobs
export function listJobs(): Promise<{ jobs: JobSummary[] }> {
	return get('/jobs');
}

export function getJob(id: number): Promise<JobDetail> {
	return get(`/jobs/${id}`);
}

// Executions
export function listExecutions(): Promise<{ executions: Execution[] }> {
	return get('/executions');
}

export function getExecution(id: string): Promise<Execution> {
	return get(`/executions/${id}`);
}


// Applications
export function saveAnswers(jobId: number, answers: Record<string, string>): Promise<{ ok: boolean }> {
	return post(`/jobs/${jobId}/answers`, { answers });
}

export function applyToJob(jobId: number, answers?: Record<string, string>, resumeFilename?: string): Promise<unknown> {
	return post(`/jobs/${jobId}/apply`, { answers, resumeFilename });
}

export function rejectJob(jobId: number): Promise<{ ok: boolean }> {
	return post(`/jobs/${jobId}/reject`);
}

export function rejectJobsByStatus(statuses: ApplicationStatus[]): Promise<{ rejected: number }> {
	return post('/jobs/reject', { statuses });
}

export function reprocessJob(jobId: number): Promise<{ ok: boolean }> {
	return post(`/jobs/${jobId}/reprocess`);
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

// Loop eterno
export function getExecutionStatus(): Promise<ExecutionStatus> {
	return get('/execution');
}

export function startExecution(config: DiscoverConfig & { cycleMaxMs?: number; intervalMs?: number }): Promise<{ ok: boolean }> {
	return post('/execution/start', config);
}

export function stopExecution(): Promise<{ ok: boolean }> {
	return post('/execution/stop');
}

export function pauseExecution(): Promise<{ ok: boolean }> {
	return post('/execution/pause');
}

export function resumeExecution(): Promise<{ ok: boolean }> {
	return post('/execution/resume');
}

export type ProviderInfo = {
	id: string;
	name: string;
	configured: boolean;
	authMethods: ('oauth' | 'api_key')[];
	models: { id: string; label: string }[];
};

export type LlmSettingsResponse = {
	providers: ProviderInfo[];
	current: LlmSettings;
};

export function getLlmSettings(): Promise<LlmSettingsResponse> {
	return get('/settings/llm');
}

export function setProviderApiKey(provider: string, apiKey: string): Promise<{ ok: boolean }> {
	return put(`/settings/llm/providers/${encodeURIComponent(provider)}`, { apiKey });
}

export function removeProviderApiKey(provider: string): Promise<{ ok: boolean }> {
	return del(`/settings/llm/providers/${encodeURIComponent(provider)}`);
}

export function updateLlmSettings(update: Partial<LlmSettings>): Promise<LlmSettings> {
	return patch('/settings/llm', update);
}

export function startOAuth(provider: string): Promise<{ sessionId: string; type: 'browser' | 'device_code' }> {
	return post(`/settings/llm/providers/${encodeURIComponent(provider)}/oauth/start`);
}

export function pollOAuth(provider: string, sessionId: string): Promise<{ status: string; url?: string; userCode?: string; verificationUri?: string; error?: string }> {
	return get(`/settings/llm/providers/${encodeURIComponent(provider)}/oauth/poll?sessionId=${encodeURIComponent(sessionId)}`);
}

import { PUBLIC_API_URL } from '$env/static/public';
import type {
	AppSettings,
	AutoApplyStatus,
	Execution,
	JobDetail,
	JobSummary,
	ExecutionStatus,
	ExternalApplyStatus,
	LlmSettings,
	TelegramStatus
} from './types';

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
export function saveAnswers(
	jobId: number,
	answers: Record<string, string>
): Promise<{ ok: boolean }> {
	return post(`/jobs/${jobId}/answers`, { answers });
}

export function applyToJob(
	jobId: number,
	answers?: Record<string, string>,
	resumeFilename?: string
): Promise<unknown> {
	return post(`/jobs/${jobId}/apply`, { answers, resumeFilename });
}

export function rejectJob(jobId: number): Promise<{ ok: boolean }> {
	return post(`/jobs/${jobId}/reject`);
}

export function rejectJobs(ids: number[]): Promise<{ rejected: number }> {
	return post('/jobs/reject', { ids });
}

export function approveJobs(ids: number[]): Promise<{ approved: number }> {
	return post('/jobs/approve', { ids });
}

export function retryJob(jobId: number): Promise<{ ok: boolean }> {
	return post(`/jobs/${jobId}/reprocess`);
}

export async function addManualJob(
	url: string
): Promise<{ status: 'scraping' | 'reactivated' | 'exists' }> {
	const res = await fetch(`${BASE}/jobs`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ url })
	});
	const data = await res.json().catch(() => null);
	if (!res.ok) {
		throw new Error(data?.message || data?.error || `${res.status} POST /jobs`);
	}
	return data;
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

export function getTelegramStatus(): Promise<TelegramStatus> {
	return get('/settings/telegram');
}

export function startTelegramPairing(): Promise<{ code: string }> {
	return post('/settings/telegram/pair');
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

// Resume masters (structured, for tailoring)
export interface ResumeIssue {
	path: (string | number)[];
	message: string;
}

export function listMasters(): Promise<{ masters: string[] }> {
	return get('/resume/masters');
}

export function getMaster(name: string): Promise<{ yaml: string | null }> {
	return get(`/resume/masters/${encodeURIComponent(name)}`);
}

export async function saveMaster(
	name: string,
	yaml: string
): Promise<{ ok: true } | { issues: ResumeIssue[] }> {
	const res = await fetch(`${BASE}/resume/masters/${encodeURIComponent(name)}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ yaml })
	});
	if (res.status === 400) {
		const data = (await res.json()) as { issues?: ResumeIssue[] };
		return { issues: data.issues ?? [] };
	}
	if (!res.ok) throw new Error(`${res.status} PUT /resume/masters`);
	return { ok: true };
}

export function deleteMaster(name: string): Promise<{ ok: boolean }> {
	return del(`/resume/masters/${encodeURIComponent(name)}`);
}

export function extractMaster(name: string, resumeFilename?: string): Promise<{ yaml: string }> {
	return post(`/resume/masters/${encodeURIComponent(name)}/extract`, { resumeFilename });
}

export function tailorJob(id: number, master?: string): Promise<{ ok: boolean; master: string }> {
	return post(`/jobs/${id}/tailor`, master ? { master } : {});
}

export function getTailored(id: number): Promise<{ exists: boolean; master: string | null; updatedAt: string | null }> {
	return get(`/jobs/${id}/tailor`);
}

export function deleteTailored(id: number): Promise<{ ok: boolean }> {
	return del(`/jobs/${id}/tailor`);
}

export function tailorPreviewUrl(id: number, version?: number): string {
	return `${BASE}/jobs/${id}/tailor/preview.pdf${version ? `?t=${version}` : ''}`;
}

export function resumePreviewUrl(filename: string): string {
	return `${BASE}/resumes/${encodeURIComponent(filename)}/preview.pdf`;
}

// Database
export function clearDatabase(): Promise<{ ok: boolean }> {
	return del('/database');
}

// Loop eterno
export function getExecutionStatus(): Promise<ExecutionStatus> {
	return get('/execution');
}

export function getExternalApplyStatus(): Promise<ExternalApplyStatus> {
	return get('/external-apply');
}

export function sendExternalApplyMessage(jobId: number, text: string): Promise<{ ok: boolean }> {
	return post('/external-apply/message', { jobId, text });
}

export function stopExternalApply(jobId: number): Promise<{ ok: boolean }> {
	return post('/external-apply/stop', { jobId });
}

export function resumeExternalApply(jobId: number): Promise<{ ok: boolean }> {
	return post('/external-apply/resume', { jobId });
}

export function startExecution(): Promise<{ ok: boolean }> {
	return post('/execution/start');
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

export function startOAuth(
	provider: string
): Promise<{ sessionId: string; type: 'browser' | 'device_code' }> {
	return post(`/settings/llm/providers/${encodeURIComponent(provider)}/oauth/start`);
}

export function pollOAuth(
	provider: string,
	sessionId: string
): Promise<{
	status: string;
	url?: string;
	userCode?: string;
	verificationUri?: string;
	error?: string;
}> {
	return get(
		`/settings/llm/providers/${encodeURIComponent(provider)}/oauth/poll?sessionId=${encodeURIComponent(sessionId)}`
	);
}

export function githubAuthStartUrl(): string {
	return `${BASE}/auth/github/start`;
}

export function githubRepos(): Promise<{ repos: string[] }> {
	return get('/github/repos');
}

export function githubSync(repo: string): Promise<{ ok: boolean; masters: string[] }> {
	return post('/github/sync', { repo });
}

export function githubDisconnect(): Promise<{ ok: boolean }> {
	return post('/github/disconnect');
}

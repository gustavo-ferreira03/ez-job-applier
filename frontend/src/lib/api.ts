import { PUBLIC_API_URL } from '$env/static/public';
import type { JobDetail, RunConfig, StateResponse } from './types';

const BASE = PUBLIC_API_URL || 'http://localhost:8000';

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

export function getState() {
	return get<StateResponse>('/state');
}

export function startRun(config: RunConfig) {
	return post<{ ok: boolean }>('/runs', config);
}

export function cancelRun() {
	return post<{ cancelled: boolean }>('/runs/cancel');
}

export function getJob(jobId: string) {
	return get<JobDetail>(`/jobs/${encodeURIComponent(jobId)}`);
}

export function submitAnswers(appId: number, answers: Record<string, string>) {
	return post<{ ok: boolean }>(`/applications/${appId}/answers`, { answers });
}

export function approveApplication(appId: number, cvFilename: string | null = null) {
	return post<{ ok: boolean }>(`/applications/${appId}/approve`, { cv_filename: cvFilename });
}

export function markApplied(appId: number) {
	return post<{ ok: boolean }>(`/applications/${appId}/mark-applied`);
}

export function skipApplication(appId: number) {
	return post<{ ok: boolean }>(`/applications/${appId}/skip`);
}

export async function uploadCV(file: File): Promise<{ filename: string }> {
	const form = new FormData();
	form.append('file', file);
	const res = await fetch(`${BASE}/cvs`, { method: 'POST', body: form });
	if (!res.ok) throw new Error(`${res.status} POST /cvs`);
	return res.json();
}

export function setDefaultCV(filename: string | null) {
	return post<{ ok: boolean }>('/cvs/default', { filename });
}

export function deleteCV(filename: string) {
	return del<{ ok: boolean }>(`/cvs/${encodeURIComponent(filename)}`);
}

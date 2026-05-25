import type { JobSummary } from './types';

export const mockJobs: JobSummary[] = [
	{
		job_id: 'mock-1001',
		title: 'Junior Python Developer',
		company: 'Cloud Harbor',
		location: 'Remote, Brazil',
		application_id: 1001,
		status: 'FOUND',
		error_message: null,
		application_updated_at: '2026-05-25T09:10:00',
		updated_at: '2026-05-25T09:10:00',
		unanswered_count: 0
	},
	{
		job_id: 'mock-1002',
		title: 'Backend Engineer - Automation',
		company: 'Northstar Labs',
		location: 'Sao Paulo, Brazil',
		application_id: 1002,
		status: 'NEEDS_INPUT',
		error_message: null,
		application_updated_at: '2026-05-25T09:28:00',
		updated_at: '2026-05-25T09:28:00',
		unanswered_count: 3
	},
	{
		job_id: 'mock-1003',
		title: 'Software Engineer, Data Tools',
		company: 'MetricWorks',
		location: 'Hybrid, Curitiba',
		application_id: 1003,
		status: 'READY_FOR_REVIEW',
		error_message: null,
		application_updated_at: '2026-05-25T10:04:00',
		updated_at: '2026-05-25T10:04:00',
		unanswered_count: 0
	},
	{
		job_id: 'mock-1004',
		title: 'Python Developer',
		company: 'Atlas Fintech',
		location: 'Remote',
		application_id: 1004,
		status: 'EXTERNAL',
		error_message: null,
		application_updated_at: '2026-05-25T10:22:00',
		updated_at: '2026-05-25T10:22:00',
		unanswered_count: 0
	},
	{
		job_id: 'mock-1005',
		title: 'Automation QA Engineer',
		company: 'SignalForge',
		location: 'Remote, LATAM',
		application_id: 1005,
		status: 'SUBMITTED',
		error_message: null,
		application_updated_at: '2026-05-25T11:16:00',
		updated_at: '2026-05-25T11:16:00',
		unanswered_count: 0
	},
	{
		job_id: 'mock-1006',
		title: 'Full Stack Developer',
		company: 'Fjord Systems',
		location: 'Rio de Janeiro, Brazil',
		application_id: 1006,
		status: 'FAILED',
		error_message: 'LinkedIn form changed while submitting the application.',
		application_updated_at: '2026-05-25T11:42:00',
		updated_at: '2026-05-25T11:42:00',
		unanswered_count: 0
	},
	{
		job_id: 'mock-1007',
		title: 'Associate Backend Developer',
		company: 'Terra Byte',
		location: 'Belo Horizonte, Brazil',
		application_id: 1007,
		status: 'REJECTED',
		error_message: null,
		application_updated_at: '2026-05-25T12:01:00',
		updated_at: '2026-05-25T12:01:00',
		unanswered_count: 0
	}
];

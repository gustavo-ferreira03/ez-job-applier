export type ApplicationStatus =
	| 'FOUND'
	| 'NEEDS_INPUT'
	| 'READY_FOR_REVIEW'
	| 'EXTERNAL'
	| 'SUBMITTED'
	| 'SKIPPED'
	| 'FAILED';

export type KanbanTab = 'info' | 'actions';

export interface DiscoverConfig {
	provider: string;
	keywords?: string;
	location?: string;
	workType?: string;
	experienceLevel?: string[];
	jobType?: string[];
	datePosted?: string;
	maxJobs?: number;
	options?: Record<string, unknown>;
}

export interface ApplicationQuestion {
	label: string;
	answer: string | null;
	fieldType: string | null;
	options: string[];
}

export interface JobSummary {
	id: number;
	externalId: string;
	provider: string;
	title: string;
	company: string;
	location: string;
	url: string;
	preferences: string[];
	skills: string[];
	about: string | null;
	applicationUrl: string | null;
	status: ApplicationStatus;
	resumeFilename: string | null;
	errorMessage: string | null;
	unansweredCount: number;
	createdAt: string;
	updatedAt: string;
}

export interface JobDetail extends JobSummary {
	questions: ApplicationQuestion[];
}

export interface Execution {
	id: string;
	config: DiscoverConfig;
	status: 'running' | 'waiting' | 'paused' | 'done' | 'failed' | 'cancelled';
	discovered: number;
	cycleMaxMs: number;
	intervalMs: number;
	nextRunAt: string | null;
	startedAt: string;
	finishedAt: string | null;
	errorMessage: string | null;
}

export interface AppSettings {
	browserVisible: boolean;
	searchLocale: 'pt-BR' | 'en-US';
}

export interface AutoApplyStatus {
	running: boolean;
	applied: number;
	failed: number;
}

export interface KanbanColumn {
	id: string;
	title: string;
	statuses: ApplicationStatus[];
	defaultTab?: KanbanTab;
	muted?: boolean;
	alert?: 'yellow' | 'blue' | 'purple';
}

export type Page = 'pipeline' | 'tabela' | 'discoveries' | 'configuracoes';

export interface ExecutionStatus {
    active: boolean;
    running: boolean;
    paused: boolean;
    actionNeeded: boolean;
    nextRunAt: string | null;
    cycleMaxMs: number;
    intervalMs: number;
    config: DiscoverConfig | null;
}

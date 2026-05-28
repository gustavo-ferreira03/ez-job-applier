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

export interface DiscoveryJob {
	id: string;
	provider: string;
	config: DiscoverConfig;
	status: 'running' | 'done' | 'failed' | 'cancelled';
	discovered: number;
	startedAt: string;
	finishedAt: string | null;
	errorMessage: string | null;
}

export interface KanbanColumn {
	id: string;
	title: string;
	statuses: ApplicationStatus[];
	defaultTab?: KanbanTab;
	muted?: boolean;
	alert?: 'yellow' | 'blue' | 'purple';
}

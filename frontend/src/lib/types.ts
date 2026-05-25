export type ApplicationStatus =
	| 'FOUND'
	| 'NEEDS_INPUT'
	| 'READY_FOR_REVIEW'
	| 'EXTERNAL'
	| 'SUBMITTED'
	| 'SKIPPED'
	| 'REJECTED'
	| 'FAILED';

export type KanbanTab = 'info' | 'actions';

export interface JobSummary {
	job_id: string;
	title: string | null;
	company: string | null;
	location: string | null;
	application_id: number | null;
	status: ApplicationStatus;
	error_message: string | null;
	application_updated_at: string | null;
	updated_at: string | null;
	unanswered_count: number;
}

export interface KanbanColumn {
	id: string;
	title: string;
	statuses: ApplicationStatus[];
	defaultTab?: KanbanTab;
	muted?: boolean;
	alert?: 'yellow' | 'blue' | 'purple';
}

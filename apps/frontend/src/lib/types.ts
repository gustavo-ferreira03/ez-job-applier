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

export interface RunConfig {
	keywords: string;
	location: string | null;
	easy_apply: boolean;
	work_type: string | null;
	experience_level: string[];
	job_type: string[];
	date_posted: string | null;
	include_top_applicant: boolean;
	max_apply: number | null;
	fill_skill_gaps: boolean;
}

export interface ApplicationQuestion {
	id: number | null;
	application_id: number | null;
	label: string;
	answer: string | null;
	field_type: string | null;
	options: string[];
}

export interface JobSummary {
	id: number;
	job_id: string;
	title: string | null;
	company: string | null;
	location: string | null;
	url: string;
	easy_apply: boolean;
	preferences: string[];
	skills: string[];
	about: string | null;
	application_url: string | null;
	application_id: number | null;
	status: ApplicationStatus;
	submit_approved: boolean;
	cv_filename: string | null;
	error_message: string | null;
	created_at: string | null;
	updated_at: string | null;
	application_updated_at: string | null;
	unanswered_count: number;
}

export interface JobDetail extends JobSummary {
	questions: ApplicationQuestion[];
}

export interface StateResponse {
	run: {
		running: boolean;
		worker_running: boolean;
		current_config: RunConfig | null;
	};
	jobs: JobSummary[];
	config: RunConfig & { default_cv?: string | null };
	cvs: string[];
}

export interface KanbanColumn {
	id: string;
	title: string;
	statuses: ApplicationStatus[];
	defaultTab?: KanbanTab;
	muted?: boolean;
	alert?: 'yellow' | 'blue' | 'purple';
}

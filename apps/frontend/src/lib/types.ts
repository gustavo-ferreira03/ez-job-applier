export type ApplicationStatus =
	| 'FOUND'
	| 'NEEDS_INPUT'
	| 'READY_FOR_REVIEW'
	| 'APPROVED'
	| 'SUBMITTED'
	| 'REJECTED'
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
	tags: string[];
	about: string | null;
	applicationUrl: string | null;
	status: ApplicationStatus;
	processing: boolean;
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

export interface LlmSettings {
	enabled: boolean;
	provider: string;
	model: string;
	filterJobs: boolean;
	autoAnswer: boolean;
	autoTailorResumes: boolean;
	externalApply: boolean;
	filterCriteria: string;
	resumeTailoringInstructions: string;
	resumeTailoringFlexibility: number;
}

export interface AppSettings {
	general: {
		execution: DiscoverConfig;
		defaultResume: string | null;
		blockedKeywords: string[];
		blockedCompanies: string[];
	};
	llm: LlmSettings;
	advanced: {
		browserVisible: boolean;
		searchLocale: 'pt-BR' | 'en-US';
		cycleMaxMs: number;
		intervalMs: number;
		externalApplyConcurrency: number;
		schedule: ScheduleSettings;
		telegram: {
			enabled: boolean;
			botToken: string;
			chatId: string | null;
			pairingCode: string | null;
			pairingExpiresAt: string | null;
		};
		github: GithubSettings;
	};
}

export interface GithubSettings {
	connected: boolean;
	login: string | null;
	repo: string | null;
	lastSyncedAt: string | null;
	masters: string[];
}

export interface TelegramStatus {
	paired: boolean;
	hasToken: boolean;
	enabled: boolean;
}

export interface ScheduleDay {
	enabled: boolean;
	start: string;
	end: string;
}

export interface ScheduleSettings {
	enabled: boolean;
	timezone: string;
	days: ScheduleDay[];
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
	defaultTab: KanbanTab;
	headerClass: string;
	canRejectAll?: boolean;
	canSubmitAll?: boolean;
	canRetryAll?: boolean;
	canAdd?: boolean;
	columnClass?: string;
}

export type Page = 'pipeline' | 'chat' | 'configuracoes';

export interface ChatThreadSummary {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
}

export interface ChatAttachment {
	id: string;
	filename: string;
	mimeType: string;
	size: number;
}

export interface ChatMessage {
	id: string;
	threadId: string;
	role: 'user' | 'agent';
	content: string;
	attachments: ChatAttachment[];
	createdAt: string;
}

export interface ChatThreadDetail {
	thread: ChatThreadSummary;
	messages: ChatMessage[];
	busy: boolean;
}

export interface ExecutionStatus {
	active: boolean;
	running: boolean;
	paused: boolean;
	actionNeeded: boolean;
	vncSessionId: string | null;
	nextRunAt: string | null;
	cycleMaxMs: number;
	intervalMs: number;
	config: DiscoverConfig | null;
}

export type ExternalApplyPhase = 'idle' | 'working' | 'waiting' | 'review' | 'submitted' | 'failed';

export interface ExternalApplyMessage {
	id: string;
	role: 'agent' | 'user';
	text: string;
	ts: number;
	attachments: ExternalApplyAttachment[];
}

export interface ExternalApplyAttachment {
	id: string;
	filename: string;
	mimeType: string;
	size: number;
	url: string;
}

export interface ExternalApplySessionStatus {
	active: boolean;
	jobId: number;
	title: string;
	vncSessionId: string | null;
	phase: ExternalApplyPhase;
	suspended: boolean;
	messages: ExternalApplyMessage[];
}

export interface ExternalApplyStatus {
	sessions: ExternalApplySessionStatus[];
}

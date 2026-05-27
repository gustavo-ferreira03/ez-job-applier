export interface Job {
    jobId: string;
    title: string;
    company: string;
    location: string;
    url: string;
    easyApply: boolean;
    preferences: string[];
    skills: string[];
    about: string | null;
    applicationUrl: string | null;
}

export interface SearchConfig {
    keywords?: string;
    location?: string;
    easyApply?: boolean;
    workType?: string;
    experienceLevel?: string[];
    jobType?: string[];
    datePosted?: string;
    maxJobs?: number;
    includeTopApplicant?: boolean;
    fillSkillGaps?: boolean;
    skipJobIds?: Set<string>;
}

export type ApplicationStatus =
    | "FOUND"
    | "NEEDS_INPUT"
    | "READY_FOR_REVIEW"
    | "SUBMITTED"
    | "SKIPPED"
    | "FAILED"
    | "EXTERNAL";

export interface ApplicationQuestion {
    label: string;
    answer?: string;
    fieldType?: string;
    options?: string[];
}

export interface EasyApplyResult {
    status: ApplicationStatus;
    questions: ApplicationQuestion[];
    errorMessage?: string;
}

export interface EasyApplyConfig {
    /** Pre-filled answers keyed by field label */
    answers?: Record<string, string>;
    /** Absolute path to the resume PDF to upload */
    resumePath?: string;
    /** If false (default), stop at READY_FOR_REVIEW without clicking submit */
    shouldSubmit?: boolean;
}

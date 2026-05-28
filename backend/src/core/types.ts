export type ApplicationStatus =
    | "FOUND"
    | "NEEDS_INPUT"
    | "READY_FOR_REVIEW"
    | "SUBMITTED"
    | "SKIPPED"
    | "FAILED"
    | "EXTERNAL";

export interface Job {
    jobId: string;
    provider: string;
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

export interface ApplicationQuestion {
    label: string;
    answer?: string;
    fieldType?: string;
    options?: string[];
}

export interface ApplyResult {
    status: ApplicationStatus;
    questions: ApplicationQuestion[];
    errorMessage?: string;
}

export interface DiscoverConfig {
    provider: string;
    keywords?: string;
    location?: string;
    easyApply?: boolean;
    workType?: string;
    experienceLevel?: string[];
    jobType?: string[];
    datePosted?: string;
    maxJobs?: number;
}

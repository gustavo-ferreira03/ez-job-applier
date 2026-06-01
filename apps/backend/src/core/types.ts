export const APPLICATION_STATUSES = [
    "FOUND",
    "NEEDS_INPUT",
    "READY_FOR_REVIEW",
    "APPROVED",
    "SUBMITTED",
    "SKIPPED",
    "FAILED",
    "EXTERNAL",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface Job {
    jobId: string;
    provider: string;
    title: string;
    company: string;
    location: string;
    url: string;
    preferences: string[];
    skills: string[];
    about: string | null;
    applicationUrl: string | null;
}

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
    answer?: string;
    fieldType?: "text" | "select" | "checkbox" | "radio" | "file" | "date";
    options?: string[];
}

export interface ApplyResult {
    status: ApplicationStatus;
    questions: ApplicationQuestion[];
    errorMessage?: string;
}

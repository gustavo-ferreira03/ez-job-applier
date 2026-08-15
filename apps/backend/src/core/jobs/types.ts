import type { ApplicationStatus, ApplicationQuestion } from "../types";

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
    /** A resume is being tailored for this job right now (see core/resumes/tailor-status). */
    tailoring: boolean;
    resumeFilename: string | null;
    errorMessage: string | null;
    unansweredCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface JobDetail extends JobSummary {
    questions: ApplicationQuestion[];
}

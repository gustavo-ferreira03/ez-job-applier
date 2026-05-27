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
}

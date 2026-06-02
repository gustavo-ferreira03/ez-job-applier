export type {
    Job,
    ApplicationStatus,
    ApplicationQuestion,
    ApplyResult,
} from "../../../core/types";

import type { Job } from "../../../core/types";

export interface LinkedinJob extends Job {
    easyApply: boolean;
}

export interface SearchConfig {
    keywords?: string;
    location?: string;
    geoId?: string;
    easyApply?: boolean;
    under10Applicants?: boolean;
    inMyNetwork?: boolean;
    workType?: string;
    experienceLevel?: string[];
    jobType?: string[];
    datePosted?: string;
    maxJobs?: number;
    includeTopApplicant?: boolean;
    fillSkillGaps?: boolean;
    skipJobIds?: Set<string>;
}

export interface EasyApplyConfig {
    answers?: Record<string, string>;
    resumePath?: string;
    shouldSubmit?: boolean;
}

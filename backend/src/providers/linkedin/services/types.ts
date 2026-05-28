// Generic types live in core — re-exported here for convenience
export type {
    Job,
    ApplicationStatus,
    ApplicationQuestion,
    ApplyResult,
} from "../../../core/types";

// LinkedIn-specific search config
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

// LinkedIn Easy Apply config
export interface EasyApplyConfig {
    answers?: Record<string, string>;
    resumePath?: string;
    shouldSubmit?: boolean;
}

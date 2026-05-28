import type { ApplyResult, DiscoverConfig, Job } from "./types";

export interface IJobProvider {
    readonly name: string;

    /** Returns true if this provider can handle the given job */
    matchesJob(job: Job): boolean;

    /** Discovers jobs and yields them one by one. Manages its own browser context. */
    discoverJobs(
        config: DiscoverConfig,
        skipIds: Set<string>,
    ): AsyncGenerator<Job>;

    /** Opens the application form and returns the questions without submitting */
    getQuestions(job: Job, resumePath?: string): Promise<ApplyResult>;

    /** Fills the application form with the given answers and submits */
    apply(
        job: Job,
        answers: Record<string, string>,
        resumePath?: string,
    ): Promise<ApplyResult>;
}

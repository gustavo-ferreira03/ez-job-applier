import type { ApplyResult, DiscoverConfig, Job } from "./types";

/**
 * A live session with a single shared browser context.
 * Create via IJobProvider.createSession() and call close() when done.
 */
export interface IJobProviderSession {
    /** Discovers jobs using the shared browser context */
    discoverJobs(config: DiscoverConfig, skipIds: Set<string>): AsyncGenerator<Job>;

    /** Opens the application form and returns questions without submitting */
    getQuestions(job: Job, resumePath?: string): Promise<ApplyResult>;

    /** Fills the form with answers and submits the application */
    apply(
        job: Job,
        answers: Record<string, string>,
        resumePath?: string,
    ): Promise<ApplyResult>;

    /** Saves the session state and closes the browser context */
    close(): Promise<void>;
}

export interface IJobProvider {
    readonly name: string;

    /** Returns true if this provider can handle the given job */
    matchesJob(job: Job): boolean;

    /**
     * Opens a browser context and returns a session.
     * The session should be reused for the entire run to avoid
     * repeated browser startups.
     */
    createSession(): Promise<IJobProviderSession>;
}

import type { ApplyResult, DiscoverConfig, Job } from "./types";

export interface IJobProviderSession {
    discoverJobs(config: DiscoverConfig, skipIds: Set<string>): AsyncGenerator<Job>;
    getQuestions(job: Job, resumePath?: string): Promise<ApplyResult>;
    apply(job: Job, answers: Record<string, string>, resumePath?: string): Promise<ApplyResult>;
    close(): Promise<void>;
}

export interface SessionOptions {
    /**
     * X display the browser must attach to (e.g. ":99"). Passed explicitly rather than through
     * process.env.DISPLAY, which is process-global and therefore unsafe to use as per-run state.
     */
    display?: string;
}

export interface IJobProvider {
    readonly name: string;
    matchesJob(job: Job): boolean;
    createSession(options?: SessionOptions): Promise<IJobProviderSession>;
    fetchJobDetails(url: string): Promise<Partial<Job>>;
}

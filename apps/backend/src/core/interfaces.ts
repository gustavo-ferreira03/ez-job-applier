import type { ApplyResult, DiscoverConfig, Job } from "./types";

export interface IJobProviderSession {
    discoverJobs(config: DiscoverConfig, skipIds: Set<string>): AsyncGenerator<Job>;
    getQuestions(job: Job, resumePath?: string): Promise<ApplyResult>;
    apply(job: Job, answers: Record<string, string>, resumePath?: string): Promise<ApplyResult>;
    close(): Promise<void>;
}

export interface IJobProvider {
    readonly name: string;
    matchesJob(job: Job): boolean;
    createSession(): Promise<IJobProviderSession>;
    fetchJobDetails(url: string): Promise<Partial<Job>>;
}

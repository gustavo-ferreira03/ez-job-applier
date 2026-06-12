import type { Job, DiscoverConfig, ApplicationQuestion, ApplicationStatus } from "./types";
import type { IJobProvider } from "./interfaces";
import type { Execution, ExecutionStatusValue } from "./discoveries/types";
import type { JobSummary, JobDetail } from "./jobs/types";

export interface IJobRepo {
    getById(id: number): Promise<Job | null>;
    getByProvider(provider: string, externalId: string): Promise<Job | null>;
    listIds(provider?: string): Promise<Set<string>>;
    listSkipIds(provider: string): Promise<Set<string>>;
    save(job: Job): Promise<void>;
    getDetail(id: number): Promise<JobDetail | null>;
    listSummaries(): Promise<JobSummary[]>;
}

export interface ApplicationRecord {
    id: number;
    status: ApplicationStatus;
    processing: boolean;
    resumeFilename: string | null;
    errorMessage: string | null;
}

export interface IAppRepo {
    get(provider: string, externalId: string): Promise<ApplicationRecord | null>;
    upsert(
        provider: string,
        externalId: string,
        status: ApplicationStatus,
        resumeFilename?: string,
        errorMessage?: string,
    ): Promise<ApplicationRecord>;
    updateStatus(id: number, status: ApplicationStatus, errorMessage?: string): Promise<void>;
    replaceQuestions(appId: number, questions: ApplicationQuestion[]): Promise<void>;
    getQuestions(appId: number): Promise<ApplicationQuestion[]>;
    answerQuestions(appId: number, answers: Record<string, string>): Promise<void>;
    approveByIds(jobIds: number[]): Promise<number>;
    listIdsByStatus(status: ApplicationStatus): Promise<number[]>;
    listFoundJobIds(): Promise<number[]>;
    setProcessing(appId: number, processing: boolean): Promise<void>;
}

export interface IExecutionRepo {
    create(id: string, config: DiscoverConfig, cycleMaxMs: number, intervalMs: number): Promise<void>;
    incrementDiscovered(id: string): Promise<void>;
    setStatus(id: string, status: ExecutionStatusValue, nextRunAt?: string | null, errorMessage?: string): Promise<void>;
    getActive(): Promise<Execution | null>;
    get(id: string): Promise<Execution | null>;
    list(): Promise<Execution[]>;
}

export interface IResumeRepo {
    getDefaultResumePath(): Promise<string | undefined>;
    getDefaultResumeText(): Promise<string | undefined>;
    getResumePath(filename: string): Promise<string>;
}

export interface IProviderRegistry {
    register(provider: IJobProvider): void;
    get(name: string): IJobProvider;
    getForJob(job: Job): IJobProvider;
}

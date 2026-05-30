import type { Job, DiscoverConfig, ApplicationQuestion, ApplicationStatus } from "./types";
import type { IJobProvider } from "./interfaces";
import type { DiscoveryJob } from "./discoveries/types";
import type { JobSummary, JobDetail } from "./jobs/types";

export interface IJobRepo {
    getById(id: number): Promise<Job | null>;
    getByProvider(provider: string, externalId: string): Promise<Job | null>;
    listIds(provider?: string): Promise<Set<string>>;
    save(job: Job): Promise<void>;
    getDetail(id: number): Promise<JobDetail | null>;
    listSummaries(): Promise<JobSummary[]>;
}

export interface ApplicationRecord {
    id: number;
    status: ApplicationStatus;
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
    listIdsByStatus(status: ApplicationStatus | string): Promise<number[]>;
    listFoundJobIds(): Promise<number[]>;
}

export interface IDiscoveryRepo {
    isRunning(): Promise<boolean>;
    create(id: string, config: DiscoverConfig): Promise<void>;
    incrementDiscovered(id: string): Promise<void>;
    finish(id: string, status: DiscoveryJob["status"], errorMessage?: string): Promise<void>;
    get(id: string): Promise<DiscoveryJob | null>;
    list(): Promise<DiscoveryJob[]>;
}

export interface IResumeRepo {
    /** Retorna o path absoluto do resume padrão, ou undefined se nenhum configurado */
    getDefaultResumePath(): Promise<string | undefined>;
}

export interface IProviderRegistry {
    register(provider: IJobProvider): void;
    get(name: string): IJobProvider;
    getForJob(job: Job): IJobProvider;
}

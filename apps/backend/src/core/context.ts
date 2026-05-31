import type { IJobRepo, IAppRepo, IExecutionRepo, IResumeRepo, IProviderRegistry } from "./ports";

export interface AppContext {
    jobRepo: IJobRepo;
    appRepo: IAppRepo;
    executionRepo: IExecutionRepo;
    resumeRepo: IResumeRepo;
    providerRegistry: IProviderRegistry;
}

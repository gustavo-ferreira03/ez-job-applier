import type { IJobRepo, IAppRepo, IDiscoveryRepo, IResumeRepo, IProviderRegistry } from "./ports";

export interface AppContext {
    jobRepo: IJobRepo;
    appRepo: IAppRepo;
    discoveryRepo: IDiscoveryRepo;
    resumeRepo: IResumeRepo;
    providerRegistry: IProviderRegistry;
}

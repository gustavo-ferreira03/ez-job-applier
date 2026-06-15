import type { IJobRepo, IAppRepo, IExecutionRepo, IResumeRepo, IResumeMasterRepo, IProviderRegistry } from "./ports";
import type { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { ILlmClient } from "./llm/types";

export interface AppContext {
    jobRepo: IJobRepo;
    appRepo: IAppRepo;
    executionRepo: IExecutionRepo;
    resumeRepo: IResumeRepo;
    resumeMasterRepo: IResumeMasterRepo;
    providerRegistry: IProviderRegistry;
    llmAuth: AuthStorage;
    modelRegistry: ModelRegistry;
    llm: ILlmClient;
}

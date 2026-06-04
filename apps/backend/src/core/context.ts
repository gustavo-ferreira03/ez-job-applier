import type { IJobRepo, IAppRepo, IExecutionRepo, IResumeRepo, IProviderRegistry } from "./ports";
import type { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { ILlmClient } from "./llm/types";

export interface AppContext {
    jobRepo: IJobRepo;
    appRepo: IAppRepo;
    executionRepo: IExecutionRepo;
    resumeRepo: IResumeRepo;
    providerRegistry: IProviderRegistry;
    llmAuth: AuthStorage;
    modelRegistry: ModelRegistry;
    llm: ILlmClient;
}

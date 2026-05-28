import type { IJobProvider } from "./interfaces";
import type { Job } from "./types";

const providers = new Map<string, IJobProvider>();

export function registerProvider(provider: IJobProvider): void {
    providers.set(provider.name, provider);
}

export function getProvider(name: string): IJobProvider {
    const provider = providers.get(name);
    if (!provider) throw new Error(`Provider "${name}" not registered`);
    return provider;
}

export function getProviderForJob(job: Job): IJobProvider {
    for (const provider of providers.values()) {
        if (provider.matchesJob(job)) return provider;
    }
    throw new Error(`No provider found for job "${job.jobId}" (${job.url})`);
}

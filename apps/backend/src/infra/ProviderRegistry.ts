import type { IJobProvider } from "../core/interfaces";
import type { IProviderRegistry } from "../core/ports";
import type { Job } from "../core/types";

export class ProviderRegistry implements IProviderRegistry {
    private providers = new Map<string, IJobProvider>();

    register(provider: IJobProvider): void {
        this.providers.set(provider.name, provider);
    }

    get(name: string): IJobProvider {
        const provider = this.providers.get(name);
        if (!provider) throw new Error(`Provider "${name}" not registered`);
        return provider;
    }

    getForJob(job: Job): IJobProvider {
        for (const provider of this.providers.values()) {
            if (provider.matchesJob(job)) return provider;
        }
        throw new Error(`No provider found for job "${job.jobId}" (${job.url})`);
    }
}

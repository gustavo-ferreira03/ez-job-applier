import { getProvider } from "../registry";
import { listJobIds, saveJob } from "../../repositories/jobs/services/storage";
import type { DiscoverConfig, Job } from "../types";

export async function* discoverJobs(config: DiscoverConfig): AsyncGenerator<Job> {
    const provider = getProvider(config.provider);
    const skipIds = await listJobIds();

    for await (const job of provider.discoverJobs(config, skipIds)) {
        await saveJob(job);
        yield job;
    }
}

import path from "node:path";
import type { AppContext } from "../context";
import type { DiscoverConfig } from "../types";
import type { IJobProviderSession } from "../interfaces";

export async function runCycle(
    executionId: string,
    config: DiscoverConfig,
    cycleMaxMs: number,
    ctx: AppContext,
    shouldStop: () => boolean,
    onSession?: (session: IJobProviderSession | null) => void,
): Promise<void> {
    const cycleStart = Date.now();
    const provider = ctx.providerRegistry.get(config.provider);
    const resumePath = await ctx.resumeRepo.getDefaultResumePath();
    const skipIds = await ctx.jobRepo.listSkipIds(config.provider);

    console.log(`[execution] cycle started — skip ${skipIds.size} already-processed jobs`);

    const session = await provider.createSession();
    onSession?.(session);
    try {
        for await (const job of session.discoverJobs(config, skipIds)) {
            if (shouldStop() || Date.now() - cycleStart > cycleMaxMs) {
                console.log("[execution] cycle interrupted");
                break;
            }

            await ctx.jobRepo.save(job);
            await ctx.executionRepo.incrementDiscovered(executionId);
            console.log(`[execution] discovered: ${job.title} @ ${job.company}`);

            const initApp = await ctx.appRepo.upsert(job.provider, job.jobId, "FOUND");
            await ctx.appRepo.setProcessing(initApp.id, true);

            try {
                const result = await session.getQuestions(job, resumePath);
                const resumeFilename = resumePath ? path.basename(resumePath) : undefined;
                const appRec = await ctx.appRepo.upsert(
                    job.provider,
                    job.jobId,
                    result.status,
                    resumeFilename,
                    result.errorMessage,
                );
                await ctx.appRepo.setProcessing(appRec.id, false);
                await ctx.appRepo.replaceQuestions(appRec.id, result.questions);
                console.log(`[execution] processed: ${job.title} → ${result.status}`);
            } catch (e) {
                console.error(`[execution] getQuestions failed for ${job.jobId}:`, e);
                const appRec = await ctx.appRepo.upsert(job.provider, job.jobId, "FAILED", undefined, String(e));
                await ctx.appRepo.setProcessing(appRec.id, false);
            }
        }
    } finally {
        onSession?.(null);
        await session.close();
        const elapsed = Math.round((Date.now() - cycleStart) / 1000);
        console.log(`[execution] cycle finished (${elapsed}s)`);
    }
}

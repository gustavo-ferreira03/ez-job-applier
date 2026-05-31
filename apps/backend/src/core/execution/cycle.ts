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
        await drainRetries(session, resumePath, ctx);

        for await (const job of session.discoverJobs(config, skipIds)) {
            if (shouldStop() || Date.now() - cycleStart > cycleMaxMs) {
                console.log("[execution] cycle interrupted");
                break;
            }

            await ctx.jobRepo.save(job);
            await ctx.executionRepo.incrementDiscovered(executionId);
            console.log(`[execution] discovered: ${job.title} @ ${job.company}`);

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
                await ctx.appRepo.replaceQuestions(appRec.id, result.questions);
                console.log(`[execution] processed: ${job.title} → ${result.status}`);
            } catch (e) {
                console.error(`[execution] getQuestions failed for ${job.jobId}:`, e);
                await ctx.appRepo.upsert(job.provider, job.jobId, "FAILED", undefined, String(e));
            }

            await drainRetries(session, resumePath, ctx);
        }
    } finally {
        onSession?.(null);
        await session.close();
        const elapsed = Math.round((Date.now() - cycleStart) / 1000);
        console.log(`[execution] cycle finished (${elapsed}s)`);
    }
}

async function drainRetries(
    session: IJobProviderSession,
    resumePath: string | undefined,
    ctx: AppContext,
): Promise<void> {
    const readyJobIds = await ctx.appRepo.listIdsByStatus("READY_FOR_REVIEW");
    if (readyJobIds.length === 0) return;

    console.log(`[execution] draining ${readyJobIds.length} READY_FOR_REVIEW job(s)`);
    const resumeFilename = resumePath ? path.basename(resumePath) : undefined;

    for (const jobId of readyJobIds) {
        const job = await ctx.jobRepo.getById(jobId);
        if (!job) continue;
        const appRec = await ctx.appRepo.get(job.provider, job.jobId);
        if (!appRec) continue;

        const questions = await ctx.appRepo.getQuestions(appRec.id);
        const answers: Record<string, string> = {};
        for (const q of questions) {
            if (q.answer) answers[q.label] = q.answer;
        }

        try {
            const result = await session.apply(job, answers, resumePath);
            const updated = await ctx.appRepo.upsert(
                job.provider, job.jobId, result.status, resumeFilename, result.errorMessage,
            );
            await ctx.appRepo.replaceQuestions(updated.id, result.questions);
            console.log(`[execution] submitted: ${job.title} → ${result.status}`);
        } catch (e) {
            console.error(`[execution] apply failed for job ${jobId}:`, e);
        }
    }
}

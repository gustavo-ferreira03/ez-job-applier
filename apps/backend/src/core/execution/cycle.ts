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
        await processQueue(session, resumePath, ctx, shouldStop);

        for await (const job of session.discoverJobs(config, skipIds)) {
            if (shouldStop() || Date.now() - cycleStart > cycleMaxMs) {
                console.log("[execution] cycle interrupted");
                break;
            }

            await ctx.jobRepo.save(job);
            await ctx.appRepo.upsert(job.provider, job.jobId, "FOUND");
            await ctx.executionRepo.incrementDiscovered(executionId);
            console.log(`[execution] discovered: ${job.title} @ ${job.company}`);

            await processQueue(session, resumePath, ctx, shouldStop);
        }
    } finally {
        onSession?.(null);
        await session.close();
        const elapsed = Math.round((Date.now() - cycleStart) / 1000);
        console.log(`[execution] cycle finished (${elapsed}s)`);
    }
}

async function processQueue(
    session: IJobProviderSession,
    resumePath: string | undefined,
    ctx: AppContext,
    shouldStop: () => boolean,
): Promise<void> {
    const resumeFilename = resumePath ? path.basename(resumePath) : undefined;

    const foundIds = await ctx.appRepo.listIdsByStatus("FOUND");
    for (const jobId of foundIds) {
        if (shouldStop()) return;
        const job = await ctx.jobRepo.getById(jobId);
        if (!job) continue;
        const appRec = await ctx.appRepo.get(job.provider, job.jobId);
        if (!appRec) continue;

        await ctx.appRepo.setProcessing(appRec.id, true);
        try {
            const result = await session.getQuestions(job, resumePath);
            const updated = await ctx.appRepo.upsert(
                job.provider, job.jobId, result.status, resumeFilename, result.errorMessage,
            );
            await ctx.appRepo.setProcessing(updated.id, false);
            await ctx.appRepo.replaceQuestions(updated.id, result.questions);
            console.log(`[execution] questions: ${job.title} → ${result.status}`);
        } catch (e) {
            console.error(`[execution] getQuestions failed for ${job.jobId}:`, e);
            const failed = await ctx.appRepo.upsert(job.provider, job.jobId, "FAILED", undefined, String(e));
            await ctx.appRepo.setProcessing(failed.id, false);
        }
    }

    const approvedIds = await ctx.appRepo.listIdsByStatus("APPROVED");
    for (const jobId of approvedIds) {
        if (shouldStop()) return;
        const job = await ctx.jobRepo.getById(jobId);
        if (!job) continue;
        const appRec = await ctx.appRepo.get(job.provider, job.jobId);
        if (!appRec) continue;

        const questions = await ctx.appRepo.getQuestions(appRec.id);
        const answers: Record<string, string> = {};
        for (const q of questions) {
            if (q.answer) answers[q.label] = q.answer;
        }

        await ctx.appRepo.setProcessing(appRec.id, true);
        try {
            const result = await session.apply(job, answers, resumePath);
            const updated = await ctx.appRepo.upsert(
                job.provider, job.jobId, result.status, resumeFilename, result.errorMessage,
            );
            await ctx.appRepo.setProcessing(updated.id, false);
            await ctx.appRepo.replaceQuestions(updated.id, result.questions);
            console.log(`[execution] submitted: ${job.title} → ${result.status}`);
        } catch (e) {
            console.error(`[execution] apply failed for job ${jobId}:`, e);
            await ctx.appRepo.setProcessing(appRec.id, false);
        }
    }
}

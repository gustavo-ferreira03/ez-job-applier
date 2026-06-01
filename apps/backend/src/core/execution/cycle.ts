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
        await drainQueue(session, resumePath, ctx, shouldStop);

        for await (const job of session.discoverJobs(config, skipIds)) {
            if (shouldStop() || Date.now() - cycleStart > cycleMaxMs) {
                console.log("[execution] cycle interrupted");
                break;
            }

            await ctx.jobRepo.save(job);
            await ctx.appRepo.upsert(job.provider, job.jobId, "FOUND");
            await ctx.executionRepo.incrementDiscovered(executionId);
            console.log(`[execution] discovered: ${job.title} @ ${job.company}`);

            await drainQueue(session, resumePath, ctx, shouldStop);
        }

        await drainQueue(session, resumePath, ctx, shouldStop);
    } finally {
        onSession?.(null);
        await session.close();
        const elapsed = Math.round((Date.now() - cycleStart) / 1000);
        console.log(`[execution] cycle finished (${elapsed}s)`);
    }
}

async function drainQueue(
    session: IJobProviderSession,
    resumePath: string | undefined,
    ctx: AppContext,
    shouldStop: () => boolean,
): Promise<void> {
    const resumeFilename = resumePath ? path.basename(resumePath) : undefined;

    while (!shouldStop()) {
        const task = await ctx.appRepo.nextTask();
        if (!task) break;

        const job = await ctx.jobRepo.getById(task.jobId);
        if (!job) break;
        const appRec = await ctx.appRepo.get(job.provider, job.jobId);
        if (!appRec) break;

        await ctx.appRepo.setProcessing(appRec.id, true);

        if (task.action === "getQuestions") {
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
        } else {
            const questions = await ctx.appRepo.getQuestions(appRec.id);
            const answers: Record<string, string> = {};
            for (const q of questions) {
                if (q.answer) answers[q.label] = q.answer;
            }
            const applyResumePath = appRec.resumeFilename
                ? await ctx.resumeRepo.getResumePath(appRec.resumeFilename)
                : resumePath;
            try {
                const result = await session.apply(job, answers, applyResumePath ?? undefined);
                const updated = await ctx.appRepo.upsert(
                    job.provider, job.jobId, result.status,
                    applyResumePath ? path.basename(applyResumePath) : resumeFilename,
                    result.errorMessage,
                );
                await ctx.appRepo.setProcessing(updated.id, false);
                await ctx.appRepo.replaceQuestions(updated.id, result.questions);
                console.log(`[execution] submitted: ${job.title} → ${result.status}`);
            } catch (e) {
                console.error(`[execution] apply failed for ${job.jobId}:`, e);
                const failed = await ctx.appRepo.upsert(job.provider, job.jobId, "FAILED", undefined, String(e));
                await ctx.appRepo.setProcessing(failed.id, false);
            }
        }
    }
}

import path from "node:path";
import type { AppContext } from "../context";
import type { ApplyResult, DiscoverConfig } from "../types";
import type { IJobProviderSession } from "../interfaces";
import { getSettings, type AppSettings } from "../../repositories/settings";
import { shouldApply } from "../applications/filter";

const EASY_APPLY_LIMIT_MESSAGE = "LinkedIn Easy Apply daily limit reached";

export interface CycleResult {
    easyApplyLimited: boolean;
}

function isEasyApplyLimited(result: ApplyResult): boolean {
    return result.errorMessage === EASY_APPLY_LIMIT_MESSAGE;
}

export async function runCycle(
    executionId: string,
    config: DiscoverConfig,
    cycleMaxMs: number,
    ctx: AppContext,
    shouldStop: () => boolean,
    onSession?: (session: IJobProviderSession | null) => void,
): Promise<CycleResult> {
    const cycleStart = Date.now();
    const provider = ctx.providerRegistry.get(config.provider);
    const resumePath = await ctx.resumeRepo.getDefaultResumePath();
    const skipIds = await ctx.jobRepo.listSkipIds(config.provider);
    const deferredJobIds = new Set<number>();
    let easyApplyLimited = false;
    const settings = await getSettings();

    async function processPendingQueue(session: IJobProviderSession): Promise<void> {
        const result = await processQueue(session, resumePath, ctx, shouldStop, deferredJobIds, settings);
        easyApplyLimited ||= result.easyApplyLimited;
    }

    console.log(`[execution] cycle started — skip ${skipIds.size} already-processed jobs`);

    const session = await provider.createSession();
    onSession?.(session);
    try {
        await processPendingQueue(session);

        for await (const job of session.discoverJobs(config, skipIds)) {
            if (shouldStop() || Date.now() - cycleStart > cycleMaxMs) {
                console.log("[execution] cycle interrupted");
                break;
            }

            await ctx.jobRepo.save(job);
            await ctx.appRepo.upsert(job.provider, job.jobId, "FOUND");
            await ctx.executionRepo.incrementDiscovered(executionId);
            console.log(`[execution] discovered: ${job.title} @ ${job.company}`);

            await processPendingQueue(session);
        }

        await processPendingQueue(session);
    } finally {
        onSession?.(null);
        await session.close();
        const elapsed = Math.round((Date.now() - cycleStart) / 1000);
        console.log(`[execution] cycle finished (${elapsed}s)`);
    }

    return { easyApplyLimited };
}

async function processQueue(
    session: IJobProviderSession,
    resumePath: string | undefined,
    ctx: AppContext,
    shouldStop: () => boolean,
    deferredJobIds: Set<number>,
    settings: AppSettings,
): Promise<CycleResult> {
    const resumeFilename = resumePath ? path.basename(resumePath) : undefined;
    let easyApplyLimited = false;

    const foundIds = await ctx.appRepo.listIdsByStatus("FOUND");
    for (const jobId of foundIds) {
        if (shouldStop()) return { easyApplyLimited };
        if (deferredJobIds.has(jobId)) continue;
        const job = await ctx.jobRepo.getById(jobId);
        if (!job) continue;
        const appRec = await ctx.appRepo.get(job.provider, job.jobId);
        if (!appRec) continue;

        if (settings.llm.filterJobs) {
            const decision = await shouldApply(job, ctx, settings.llm).catch(() => null);
            if (decision && !decision.apply) {
                await ctx.appRepo.upsert(job.provider, job.jobId, "REJECTED", undefined, decision.reason);
                console.log(`[execution] filtered: ${job.title} — ${decision.reason}`);
                continue;
            }
        }

        await ctx.appRepo.setProcessing(appRec.id, true);
        try {
            const result = await session.getQuestions(job, resumePath);
            const updated = await ctx.appRepo.upsert(
                job.provider, job.jobId, result.status, resumeFilename, result.errorMessage,
            );
            await ctx.appRepo.setProcessing(updated.id, false);
            if (!isEasyApplyLimited(result) || result.questions.length > 0) {
                await ctx.appRepo.replaceQuestions(updated.id, result.questions);
            }
            if (isEasyApplyLimited(result)) {
                easyApplyLimited = true;
                deferredJobIds.add(jobId);
                console.log(`[execution] deferred: ${job.title} → ${result.errorMessage}`);
            } else {
                console.log(`[execution] questions: ${job.title} → ${result.status}`);
            }
        } catch (e) {
            await ctx.appRepo.setProcessing(appRec.id, false);

            console.error(`[execution] getQuestions failed for ${job.jobId}:`, e);
            const failed = await ctx.appRepo.upsert(job.provider, job.jobId, "FAILED", undefined, String(e));
            await ctx.appRepo.setProcessing(failed.id, false);
        }
    }

    const approvedIds = await ctx.appRepo.listIdsByStatus("APPROVED");
    for (const jobId of approvedIds) {
        if (shouldStop()) return { easyApplyLimited };
        if (deferredJobIds.has(jobId)) continue;
        const job = await ctx.jobRepo.getById(jobId);
        if (!job) continue;
        const appRec = await ctx.appRepo.get(job.provider, job.jobId);
        if (!appRec) continue;

        const questions = await ctx.appRepo.getQuestions(appRec.id);
        const answers: Record<string, string> = {};
        for (const q of questions) {
            if (q.answer?.trim()) answers[q.label] = q.answer.trim();
        }

        await ctx.appRepo.setProcessing(appRec.id, true);
        try {
            const selectedResumePath = appRec.resumeFilename
                ? await ctx.resumeRepo.getResumePath(appRec.resumeFilename)
                : resumePath;
            const selectedResumeFilename = selectedResumePath ? path.basename(selectedResumePath) : undefined;
            const result = await session.apply(job, answers, selectedResumePath);
            const updated = await ctx.appRepo.upsert(
                job.provider, job.jobId, result.status, selectedResumeFilename, result.errorMessage,
            );
            await ctx.appRepo.setProcessing(updated.id, false);
            if (!isEasyApplyLimited(result) || result.questions.length > 0) {
                await ctx.appRepo.replaceQuestions(updated.id, result.questions);
            }
            if (isEasyApplyLimited(result)) {
                easyApplyLimited = true;
                deferredJobIds.add(jobId);
                console.log(`[execution] deferred: ${job.title} → ${result.errorMessage}`);
            } else {
                console.log(`[execution] submitted: ${job.title} → ${result.status}`);
            }
        } catch (e) {
            await ctx.appRepo.setProcessing(appRec.id, false);

            console.error(`[execution] apply failed for job ${jobId}:`, e);
        }
    }

    return { easyApplyLimited };
}

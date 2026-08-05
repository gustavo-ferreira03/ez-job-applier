import type { AppContext } from "../context";
import type { AppSettings } from "../../repositories/settings";
import { getSettings } from "../../repositories/settings";
import { tailorResume } from "./tailor";
import { isTailoring, runTailoring } from "./tailor-status";

export async function autoTailorIfNeeded(
    jobId: number,
    ctx: AppContext,
    settings?: AppSettings,
): Promise<void> {
    const current = settings ?? (await getSettings());
    if (!current.llm.autoTailorResumes) return;
    if (await ctx.resumeMasterRepo.hasTailored(jobId)) return;

    try {
        const { master } = await runTailoring(jobId, () =>
            tailorResume(
                jobId,
                ctx,
                undefined,
                current.llm.resumeTailoringInstructions,
                current.llm.resumeTailoringFlexibility,
            ),
        );
        console.log(`[auto-tailor] generated tailored resume for job ${jobId} via ${master}`);
    } catch (e) {
        console.warn(`[auto-tailor] failed for job ${jobId}:`, e);
    }
}

export function scheduleAutoTailorIfNeeded(
    jobId: number,
    ctx: AppContext,
    settings?: AppSettings,
): void {
    if (isTailoring(jobId)) return;

    setTimeout(() => {
        autoTailorIfNeeded(jobId, ctx, settings).catch((e) =>
            console.warn(`[auto-tailor] background task failed for job ${jobId}:`, e),
        );
    }, 0);
}

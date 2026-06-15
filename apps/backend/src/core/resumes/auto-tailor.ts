import type { AppContext } from "../context";
import type { AppSettings } from "../../repositories/settings";
import { getSettings } from "../../repositories/settings";
import { tailorResume } from "./tailor";

const queued = new Set<number>();

export async function autoTailorIfNeeded(
    jobId: number,
    ctx: AppContext,
    settings?: AppSettings,
): Promise<void> {
    const current = settings ?? (await getSettings());
    if (!current.llm.autoTailorResumes) return;
    if (await ctx.resumeMasterRepo.hasTailored(jobId)) return;

    try {
        const { master } = await tailorResume(
            jobId,
            ctx,
            undefined,
            current.llm.resumeTailoringInstructions,
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
    if (queued.has(jobId)) return;
    queued.add(jobId);

    setTimeout(() => {
        autoTailorIfNeeded(jobId, ctx, settings)
            .catch((e) => console.warn(`[auto-tailor] background task failed for job ${jobId}:`, e))
            .finally(() => {
                queued.delete(jobId);
            });
    }, 0);
}

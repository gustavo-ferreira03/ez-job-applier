import path from "node:path";
import fs from "node:fs/promises";
import type { AppContext } from "../context";
import type { SubmittedResumeMeta } from "../ports";

/**
 * Archives the exact PDF that was uploaded to an application form.
 *
 * The tailored YAML on disk is mutable — re-tailoring a job overwrites it, and template
 * changes alter the render — so reading it back later cannot prove what was sent. This
 * copies the bytes at their moment of use into a write-once directory instead.
 *
 * Best effort: a failure here must never turn a successful submission into a failed one.
 */
export async function snapshotSubmittedResume(
    ctx: AppContext,
    jobId: number,
    pdfPath: string | undefined,
    source: SubmittedResumeMeta["source"],
    master: string | null,
): Promise<void> {
    if (!pdfPath) return;
    try {
        const pdf = await fs.readFile(pdfPath);
        await ctx.resumeMasterRepo.writeSubmitted(jobId, pdf, {
            master,
            source,
            filename: path.basename(pdfPath),
            submittedAt: new Date().toISOString(),
        });
    } catch (e) {
        console.error(`[resumes] failed to archive submitted resume for job ${jobId}:`, e);
    }
}

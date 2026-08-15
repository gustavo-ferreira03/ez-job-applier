import path from "node:path";
import fs from "node:fs/promises";
import type { AppContext } from "../context";
import type { SubmittedResumeMeta } from "../ports";

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

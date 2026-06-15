import { generateResume } from "resume-ci";
import type { ResumeInput } from "resume-ci";

function sanitizeFilename(base: string): string {
    const cleaned = base.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
    return cleaned.length > 0 ? cleaned : "resume";
}

export async function generateResumePdf(data: ResumeInput, filenameBase: string): Promise<Buffer> {
    const meta = { ...(data.meta ?? {}), output_filename: sanitizeFilename(filenameBase) };
    const result = await generateResume({ ...data, meta }, { typstPath: process.env.TYPST_PATH });
    return result.pdf;
}

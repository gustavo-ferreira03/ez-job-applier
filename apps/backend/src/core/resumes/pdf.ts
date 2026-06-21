import path from "node:path";
import { generateResume } from "resume-ci";
import type { ResumeInput } from "resume-ci";

const TEMPLATES_DIR = path.resolve("storage/resume/templates");

function sanitizeFilename(base: string): string {
    const cleaned = base.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
    return cleaned.length > 0 ? cleaned : "resume";
}

export function resumeOutputName(name: string | undefined, jobTitle?: string): string {
    const parts = [name, jobTitle].filter((p): p is string => Boolean(p?.trim()));
    return sanitizeFilename(parts.join(" ")).toLowerCase();
}

export async function generateResumePdf(data: ResumeInput, filenameBase: string): Promise<Buffer> {
    const meta = { ...(data.meta ?? {}), output_filename: sanitizeFilename(filenameBase) };
    const result = await generateResume(
        { ...data, meta },
        { typstPath: process.env.TYPST_PATH, templatesDir: TEMPLATES_DIR },
    );
    return result.pdf;
}

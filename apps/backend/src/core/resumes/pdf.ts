import path from "node:path";
import { generateResume } from "resume-ci";
import type { ResumeInput } from "resume-ci";

// Templates are code, not user data: they live in the repo (and in the image), not in storage/.
const TEMPLATES_DIR = process.env.RESUME_TEMPLATES_DIR ?? path.resolve("templates");
const DEFAULT_TEMPLATE = process.env.RESUME_TEMPLATE ?? "jake";

function sanitizeFilename(base: string): string {
    const cleaned = base
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return cleaned.length > 0 ? cleaned : "resume";
}

function suggestedOutputName(data: ResumeInput): string | undefined {
    const meta = data.meta as { output_filename?: unknown } | undefined;
    return typeof meta?.output_filename === "string" ? meta.output_filename : undefined;
}

export function resumeOutputName(data: ResumeInput): string {
    const suggested = sanitizeFilename(suggestedOutputName(data) ?? "").toLowerCase();
    if (suggested !== "resume") return suggested;

    const cleanName = sanitizeFilename(data.basics?.name?.trim() || "").toLowerCase();
    return cleanName === "resume" ? "resume" : `${cleanName}_resume`;
}

export async function generateResumePdf(data: ResumeInput, filenameBase: string): Promise<Buffer> {
    const meta = { ...(data.meta ?? {}), output_filename: sanitizeFilename(filenameBase) };
    // A master YAML may pin its own `meta.template`; otherwise use the configured default.
    const template = typeof meta.template === "string" && meta.template !== "default" ? undefined : DEFAULT_TEMPLATE;
    const result = await generateResume(
        { ...data, meta },
        { typstPath: process.env.TYPST_PATH, templatesDir: TEMPLATES_DIR, template },
    );
    return result.pdf;
}

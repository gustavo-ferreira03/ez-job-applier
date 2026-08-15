import path from "node:path";
import { generateResume } from "resume-ci";
import type { ResumeInput } from "resume-ci";

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

const DEGREE_JOINERS: Record<string, string> = {
    en: "in",
    pt: "em",
    es: "en",
    fr: "en",
    it: "in",
    de: "in",
};

function localeBase(locale: unknown): string {
    return typeof locale === "string" ? (locale.toLowerCase().split(/[-_]/)[0] ?? "en") : "en";
}

function mergeDegreeFields(data: ResumeInput): ResumeInput {
    const education = data.education;
    if (!Array.isArray(education) || education.length === 0) return data;

    const joiner = DEGREE_JOINERS[localeBase(data.meta?.locale)] ?? "in";
    return {
        ...data,
        education: education.map((entry) => {
            const studyType = entry.studyType?.trim();
            const area = entry.area?.trim();
            if (!studyType || !area) return entry;
            return { ...entry, studyType: `${studyType} ${joiner} ${area}`, area: undefined };
        }),
    };
}

function hideFutureEndDates(data: ResumeInput): ResumeInput {
    const today = new Date().toISOString().slice(0, 10);
    const ongoing = <T extends { endDate?: string }>(entry: T): T => {
        const endDate = entry.endDate?.trim();
        if (!endDate || endDate <= today.slice(0, endDate.length)) return entry;
        return { ...entry, endDate: undefined };
    };

    return {
        ...data,
        ...(data.work ? { work: data.work.map(ongoing) } : {}),
        ...(data.volunteer ? { volunteer: data.volunteer.map(ongoing) } : {}),
    };
}

export async function generateResumePdf(data: ResumeInput, filenameBase: string): Promise<Buffer> {
    const input = hideFutureEndDates(mergeDegreeFields(data));
    const meta = { ...(input.meta ?? {}), output_filename: sanitizeFilename(filenameBase) };
    const template = typeof meta.template === "string" && meta.template !== "default" ? undefined : DEFAULT_TEMPLATE;
    const result = await generateResume(
        { ...input, meta },
        { typstPath: process.env.TYPST_PATH, templatesDir: TEMPLATES_DIR, template },
    );
    return result.pdf;
}

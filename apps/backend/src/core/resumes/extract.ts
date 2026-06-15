import { z } from "zod/v4";
import { stringify } from "yaml";
import type { AppContext } from "../context";

const extractSchema = z.object({
    basics: z.object({
        name: z.string(),
        label: z.string(),
        email: z.string(),
        phone: z.string(),
        location: z.object({ city: z.string(), region: z.string(), countryCode: z.string() }),
        summary: z.string(),
    }),
    work: z.array(
        z.object({
            name: z.string(),
            position: z.string(),
            startDate: z.string(),
            endDate: z.string(),
            highlights: z.array(z.string()),
        }),
    ),
    education: z.array(
        z.object({
            institution: z.string(),
            area: z.string(),
            studyType: z.string(),
            startDate: z.string(),
            endDate: z.string(),
        }),
    ),
    skills: z.array(
        z.object({
            name: z.string(),
            keywords: z.array(z.string()),
        }),
    ),
});

function pruneEmpty(value: unknown): unknown {
    if (Array.isArray(value)) {
        const items = value.map(pruneEmpty).filter((v) => v !== undefined);
        return items.length > 0 ? items : undefined;
    }
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [key, raw] of Object.entries(value)) {
            const pruned = pruneEmpty(raw);
            if (pruned !== undefined) out[key] = pruned;
        }
        return Object.keys(out).length > 0 ? out : undefined;
    }
    if (typeof value === "string") {
        return value.trim().length > 0 ? value : undefined;
    }
    return value;
}

export async function extractMasterFromResume(
    name: string,
    filename: string | undefined,
    ctx: AppContext,
): Promise<string> {
    const text = filename
        ? await ctx.resumeRepo.getResumeText(filename)
        : await ctx.resumeRepo.getDefaultResumeText();
    if (!text) {
        throw new Error("No resume PDF available to extract from");
    }

    const system = [
        "Extract a structured resume from the raw text of a candidate's PDF resume.",
        "Use only information present in the text. Use an empty string or empty array for anything not present.",
        "Dates must be YYYY, YYYY-MM, or YYYY-MM-DD. Leave endDate empty for current roles.",
    ].join(" ");

    const result = await ctx.llm.generate({ system, prompt: text, schema: extractSchema, label: "extract" });
    const yaml = stringify(pruneEmpty(result) ?? {});
    await ctx.resumeMasterRepo.writeMaster(name, yaml);
    return yaml;
}

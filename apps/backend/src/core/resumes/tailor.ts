import { z } from "zod/v4";
import { parseResume, ResumeValidationError } from "resume-ci";
import type { ResumeInput } from "resume-ci";
import type { AppContext } from "../context";
import { selectMaster } from "./select-master";
import { buildTailoringSystemPrompt } from "./tailoring-prompts";

const tailoringSchema = z.object({
    summary: z.string().optional(),
    work: z.array(
        z.object({
            name: z.string(),
            position: z.string(),
            startDate: z.string(),
            endDate: z.string(),
            location: z.string(),
            highlights: z.array(z.string()),
        }),
    ),
    skills: z.array(
        z.object({
            name: z.string(),
            keywords: z.array(z.string()),
        }),
    ),
});

const filenameSchema = z.object({
    filenameBase: z.string(),
});

type Tailoring = z.infer<typeof tailoringSchema>;
type MasterWork = NonNullable<ResumeInput["work"]>[number];

function clean(value: string | undefined): string | undefined {
    const v = value?.trim();
    return v ? v : undefined;
}

function normKw(value: string): string {
    return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function same(value: string | undefined, other: string | undefined): boolean {
    return normKw(value ?? "") === normKw(other ?? "");
}

function findOriginalWork(work: MasterWork[], used: Set<number>, item: Tailoring["work"][number], index: number): MasterWork | undefined {
    const exact = work.findIndex((w, i) => !used.has(i) && same(w.name, item.name) && same(w.position, item.position));
    if (exact >= 0) {
        used.add(exact);
        return work[exact];
    }

    const byName = work.findIndex((w, i) => !used.has(i) && same(w.name, item.name));
    if (byName >= 0) {
        used.add(byName);
        return work[byName];
    }

    const byPositionAndDate = work.findIndex(
        (w, i) =>
            !used.has(i) &&
            same(w.position, item.position) &&
            same(w.startDate, item.startDate) &&
            same(w.endDate, item.endDate),
    );
    if (byPositionAndDate >= 0) {
        used.add(byPositionAndDate);
        return work[byPositionAndDate];
    }

    if (work[index] && !used.has(index)) {
        used.add(index);
        return work[index];
    }

    const next = work.findIndex((_, i) => !used.has(i));
    if (next >= 0) {
        used.add(next);
        return work[next];
    }

    return undefined;
}

function buildTailored(master: ResumeInput, work: MasterWork[], result: Tailoring, level: number): ResumeInput {
    const enforceAllowlist = level <= 2;
    const usedWork = new Set<number>();

    const tailoredWork: MasterWork[] = result.work.flatMap((w, index) => {
        const orig = findOriginalWork(work, usedWork, w, index);
        return orig ? [{ ...orig, highlights: w.highlights }] : [];
    });

    const basics = clean(master.basics?.summary)
        ? { ...(master.basics ?? {}), summary: clean(result.summary) ?? master.basics?.summary }
        : master.basics;

    const allowed = new Map((master.skills ?? []).flatMap((g) => g.keywords ?? []).map((k) => [normKw(k), k] as const));
    const tailoredSkills = result.skills
        .map((s) => ({
            name: s.name,
            keywords: (s.keywords ?? [])
                .map((k) => (enforceAllowlist ? allowed.get(normKw(k)) : clean(k)))
                .filter((k): k is string => Boolean(k)),
        }))
        .filter((g) => g.keywords.length > 0);

    return {
        ...master,
        basics,
        work: tailoredWork.length > 0 ? tailoredWork : master.work,
        skills: tailoredSkills.length > 0 ? tailoredSkills : master.skills,
    };
}

async function generateFilenameBase(
    ctx: AppContext,
    candidateName: string | undefined,
    job: { title: string; company?: string | null; location?: string | null; about?: string | null },
): Promise<string | undefined> {
    const result = await ctx.llm.generate({
        system: [
            "Create a concise, professional PDF base filename for a tailored resume.",
            "Return only filenameBase through the schema, without the .pdf extension.",
            "Use lowercase words separated by underscores.",
            "It may include the candidate name and the clean target role when the role sounds professional.",
            "Do not blindly copy the job title. Remove job-board noise, company names, locations, remote-work phrases, hiring urgency, contract type, salary, IDs, hashtags, punctuation fragments, and marketing text.",
            "Good: gustavo_ferreira_fullstack_java_engineer.",
            "Bad: gustavo_ferreira_cosme_fullstack_java_engineer_work_from_home_talent_connection.",
            "If you cannot form a clean role-specific name, use candidate_name_resume.",
        ].join("\n"),
        prompt: [
            `Candidate name: ${candidateName ?? ""}`,
            `Job title: ${job.title}`,
            `Company: ${job.company ?? ""}`,
            `Location: ${job.location ?? ""}`,
            job.about ? `Description:\n${job.about}` : "",
        ].filter(Boolean).join("\n"),
        schema: filenameSchema,
        label: "resume-filename",
    });
    return clean(result.filenameBase);
}

export interface Posting {
    title: string;
    company?: string | null;
    location?: string | null;
    skills?: string[];
    about?: string | null;
}

export async function tailorResumeToPosting(
    posting: Posting,
    master: ResumeInput,
    ctx: AppContext,
    instructions?: string,
    flexibility: number = 2,
    label = "ad-hoc",
): Promise<ResumeInput> {
    const job = {
        title: posting.title,
        company: posting.company ?? "",
        location: posting.location ?? "",
        skills: posting.skills ?? [],
        about: posting.about ?? null,
    };
    const work = master.work ?? [];
    const skills = master.skills ?? [];
    const baseSystem = buildTailoringSystemPrompt({
        locale: master.meta?.locale,
        instructions,
        flexibility,
    });

    const workBlock = work
        .map(
            (w) =>
                `- ${w.name ?? ""} — ${w.position ?? ""} (${w.startDate ?? ""}${w.endDate ? `..${w.endDate}` : "..current"})\n${(w.highlights ?? [])
                    .map((h) => `    • ${h}`)
                    .join("\n")}`,
        )
        .join("\n");
    const skillsBlock = skills
        .map((s) => `- ${s.name ?? ""}: ${(s.keywords ?? []).join(", ")}`)
        .join("\n");

    const prompt = [
        "# Job posting",
        `Title: ${job.title}`,
        `Company: ${job.company}${job.location ? ` (${job.location})` : ""}`,
        ...(job.skills.length ? [`Required skills: ${job.skills.join(", ")}`] : []),
        ...(job.about ? [`Description:\n${job.about}`] : []),
        "",
        "# Master resume to adapt",
        ...(clean(master.basics?.summary) ? [`Summary:\n${master.basics?.summary}`] : []),
        "",
        "Experience (keep each kept job's employer, title, dates, location, links, URLs, and other metadata exactly):",
        workBlock,
        "",
        "Skills:",
        skillsBlock,
    ].join("\n");

    let correction = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await ctx.llm.generate({
            system: baseSystem + correction,
            prompt,
            schema: tailoringSchema,
            label: "tailor",
        });
        const tailored = buildTailored(master, work, result, flexibility);
        try {
            parseResume(tailored, { inputFormat: "object" });
        } catch (err) {
            if (err instanceof ResumeValidationError) {
                const issues = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
                console.warn(`[tailor] ${label}: invalid resume (attempt ${attempt + 1}): ${issues}`);
                correction = ` The previous attempt produced an INVALID resume. Fix exactly these errors and return valid values: ${issues}.`;
                continue;
            }
            throw err;
        }
        const filenameBase = await generateFilenameBase(ctx, tailored.basics?.name, job).catch((err) => {
            console.warn(`[tailor] ${label}: filename generation failed:`, err);
            return undefined;
        });
        return filenameBase
            ? { ...tailored, meta: { ...(tailored.meta ?? {}), output_filename: filenameBase } }
            : tailored;
    }

    console.warn(`[tailor] ${label}: tailoring stayed invalid after repair; falling back to master`);
    return master;
}

export async function tailorResume(
    jobId: number,
    ctx: AppContext,
    masterName?: string,
    instructions?: string,
    flexibility: number = 2,
): Promise<{ master: string }> {
    const chosen = masterName ?? (await selectMaster(jobId, ctx));
    const master = await ctx.resumeMasterRepo.readMasterParsed(chosen);
    if (!master) {
        throw new Error("No master resume found");
    }

    const job = await ctx.jobRepo.getById(jobId);
    if (!job) {
        throw new Error("Job not found");
    }

    const tailored = await tailorResumeToPosting(
        {
            title: job.title,
            company: job.company,
            location: job.location,
            skills: job.skills,
            about: job.about,
        },
        master,
        ctx,
        instructions,
        flexibility,
        `job ${jobId}`,
    );
    await ctx.resumeMasterRepo.writeTailored(jobId, tailored, {
        master: chosen,
        updatedAt: new Date().toISOString(),
    });
    return { master: chosen };
}

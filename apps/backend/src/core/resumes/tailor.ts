import { z } from "zod/v4";
import { parseResume, ResumeValidationError } from "resume-ci";
import type { ResumeInput } from "resume-ci";
import type { AppContext } from "../context";
import { selectMaster } from "./select-master";

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

type Tailoring = z.infer<typeof tailoringSchema>;
type MasterWork = NonNullable<ResumeInput["work"]>[number];

function clean(value: string | undefined): string | undefined {
    const v = value?.trim();
    return v ? v : undefined;
}

function isoDate(value: string | undefined): string | undefined {
    const v = clean(value);
    return v && /^[12]\d{3}(-\d{2}(-\d{2})?)?$/.test(v) ? v : undefined;
}

function normKw(value: string): string {
    return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function buildTailored(master: ResumeInput, work: MasterWork[], result: Tailoring): ResumeInput {
    const tailoredWork: MasterWork[] = result.work.map((w) => {
        const orig = work.find((o) => o.name === w.name && o.position === w.position);
        return {
            ...(orig ?? {}),
            name: w.name,
            position: w.position,
            startDate: orig?.startDate ?? isoDate(w.startDate),
            endDate: orig?.endDate ?? isoDate(w.endDate),
            location: clean(w.location) ?? orig?.location,
            highlights: w.highlights,
        };
    });

    const basics = clean(master.basics?.summary)
        ? { ...(master.basics ?? {}), summary: clean(result.summary) ?? master.basics?.summary }
        : master.basics;

    const allowed = new Map((master.skills ?? []).flatMap((g) => g.keywords ?? []).map((k) => [normKw(k), k] as const));
    const tailoredSkills = result.skills
        .map((s) => ({
            name: s.name,
            keywords: (s.keywords ?? [])
                .map((k) => allowed.get(normKw(k)))
                .filter((k): k is string => Boolean(k)),
        }))
        .filter((g) => g.keywords.length > 0);

    return {
        ...master,
        basics,
        work: tailoredWork,
        skills: tailoredSkills.length > 0 ? tailoredSkills : master.skills,
    };
}

export async function tailorResume(
    jobId: number,
    ctx: AppContext,
    masterName?: string,
    instructions?: string,
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

    const work = master.work ?? [];
    const skills = master.skills ?? [];
    const locale = clean(master.meta?.locale);

    const baseSystem = [
        "You are an expert resume writer. You ADAPT a candidate's existing master resume to one specific job posting. You only adapt the content that is already there — you never write a resume from scratch and never add anything the candidate does not already have.",
        "",
        "GOAL: make a recruiter and an ATS see within seconds that this candidate fits THIS job, by surfacing the candidate's most relevant existing experience and mirroring the posting's language.",
        "LANGUAGE: write all generated resume content in the job posting's language. If the job posting is in English, output the tailored resume content in English. Preserve proper nouns, employer names, degree names, and exact technology/skill names unless the posting itself uses a standard translated term.",
        "VOICE: resume prose must sound specific, human, and confirmable. Use direct verbs such as built, shipped, led, migrated, automated, reduced, increased, designed, launched, consolidated, analyzed, and mentored. Use concrete nouns: product, system, service, dashboard, workflow, customer segment, team, repository, or process. Avoid generic summaries, inflated adjectives, corporate filler, vague verbs, passive responsibility bullets starting with 'Responsible for', 'Tasked with', or 'Involved in', and AI-style constructions like 'not only X but also Y' or 'in today's fast-paced environment'. Keep bullets short with one clear claim each.",
        "",
        "HOW TO ADAPT, in priority order:",
        "1. SKILLS (most important): from the candidate's EXISTING skills only, select the ones relevant to this job, reorder them so the most relevant come first, and regroup them under headings that match the posting's focus. Use each skill's exact name. NEVER introduce a skill, technology, or note that is not already in the candidate's skills list.",
        "2. KEYWORDS: in the rewritten bullets, mirror the posting's exact terminology for the technologies and responsibilities the candidate genuinely has, and mark the terms that matter most for THIS job with **bold** markdown so they stand out.",
        "3. EXPERIENCE — rewrite, do NOT summarize: rewrite EVERY kept bullet in your own words to target this job; never output a bullet unchanged. For each real accomplishment, lead with the part most relevant to the posting, re-frame it in the posting's language, and foreground the relevant technologies, scope, and outcomes — keep the real facts and any real numbers, but change the wording and framing. Expand relevant detail and trim the irrelevant. Reorder bullets and whole jobs to front-load the most relevant experience; drop a job only if it is clearly irrelevant. The result must read as written specifically for this job, NOT as a shortened copy of the original.",
        "",
        "EXAMPLE of the expected rewrite (illustrative only; always write in the job posting's language and keep the candidate's real facts):",
        "  Original bullet: 'Built internal tools with Node.js'",
        "  Rewritten for a data-integration role: 'Engineered **Node.js** services that integrated internal systems and moved data reliably between them'",
        "Note how the wording changed and the job's focus (integration, data) was brought to the front. Do this for every bullet — never leave one as-is.",
        "",
        "NEVER:",
        "- Output any bullet copied verbatim (or merely shortened) from the master — every kept bullet must be genuinely rewritten and reframed for this job.",
        "- Add anything that is not already in the master resume: no new sections, jobs, projects, education, skills, or summary. Only adapt sections that already exist.",
        "- Invent or alter employers, job titles, dates, degrees, or numeric metrics/results.",
        "- Claim a skill the candidate's experience does not support.",
        `- Let the master resume's original language${locale ? ` (${locale})` : ""} override the job posting language. The job posting language always wins.`,
        "",
        "FORMAT: dates are 'YYYY' or 'YYYY-MM'; for an ongoing role leave the end date as an empty string and never write words like 'present'. Keep every line concise, concrete, and achievement-oriented.",
        clean(instructions)
            ? `\nADDITIONAL INSTRUCTIONS (secondary to the rules above): ${clean(instructions)}`
            : "",
    ].join("\n");

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
        "Experience (keep each kept job's employer, title, and dates exactly):",
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
        const tailored = buildTailored(master, work, result);
        try {
            parseResume(tailored, { inputFormat: "object" });
        } catch (err) {
            if (err instanceof ResumeValidationError) {
                const issues = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
                console.warn(`[tailor] job ${jobId}: invalid resume (attempt ${attempt + 1}): ${issues}`);
                correction = ` The previous attempt produced an INVALID resume. Fix exactly these errors and return valid values: ${issues}.`;
                continue;
            }
            throw err;
        }
        await ctx.resumeMasterRepo.writeTailored(jobId, tailored, {
            master: chosen,
            updatedAt: new Date().toISOString(),
        });
        return { master: chosen };
    }

    console.warn(`[tailor] job ${jobId}: tailoring stayed invalid after repair; falling back to master`);
    await ctx.resumeMasterRepo.writeTailored(jobId, master, {
        master: chosen,
        updatedAt: new Date().toISOString(),
    });
    return { master: chosen };
}

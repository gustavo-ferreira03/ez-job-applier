import { z } from "zod/v4";
import type { AppContext } from "../context";

const selectSchema = z.object({
    language: z.string(),
    master: z.string(),
    reason: z.string(),
});

const pickSchema = z.object({
    master: z.string(),
    reason: z.string(),
});

interface MasterInfo {
    name: string;
    locale?: string;
    language?: string;
    summary: string;
}

/** Base language subtag of a locale: "pt-BR" -> "pt", "en_US" -> "en". */
function baseLanguage(locale: string | undefined): string | undefined {
    const base = locale?.trim().toLowerCase().split(/[-_]/)[0];
    return base && base.length >= 2 ? base : undefined;
}

async function loadMasters(names: string[], ctx: AppContext): Promise<MasterInfo[]> {
    const infos: MasterInfo[] = [];
    for (const name of names) {
        const m = await ctx.resumeMasterRepo.readMasterParsed(name);
        const label = m?.basics?.label ?? "";
        const summary = m?.basics?.summary ?? "";
        const skills = (m?.skills ?? [])
            .flatMap((s) => s.keywords ?? [])
            .slice(0, 20)
            .join(", ");
        const roles = (m?.work ?? [])
            .map((w) => w.position ?? "")
            .filter(Boolean)
            .join(", ");
        const locale = m?.meta?.locale;
        infos.push({
            name,
            locale,
            language: baseLanguage(locale),
            summary: `- "${name}" (locale: ${locale ?? "unspecified"}): ${label}. ${summary} Skills: ${skills}. Roles: ${roles}`,
        });
    }
    return infos;
}

/**
 * Picks the master resume for a job.
 *
 * The job posting's language is the PRIMARY criterion: an English posting must be answered with
 * an English master and a Portuguese posting with a Portuguese one, so that the LLM-written body
 * and the static section titles (meta.section_titles, which the model never sees) end up in the
 * same language. Content fit only decides between masters that already match the language.
 */
export async function selectMaster(jobId: number, ctx: AppContext): Promise<string> {
    const names = await ctx.resumeMasterRepo.listMasters();
    if (names.length === 0) {
        throw new Error("No master resume found");
    }
    if (names.length === 1) {
        return names[0];
    }

    const job = await ctx.jobRepo.getById(jobId);
    if (!job) {
        throw new Error("Job not found");
    }

    const masters = await loadMasters(names, ctx);
    const jobBlock = [
        `Job: ${job.title} at ${job.company}${job.location ? ` (${job.location})` : ""}`,
        job.about ? `\n\nJob description:\n${job.about}` : "",
        job.skills.length ? `\n\nJob required skills: ${job.skills.join(", ")}` : "",
    ].join("");

    const result = await ctx.llm.generate({
        system: [
            "You pick which of the candidate's master resumes best fits a job posting.",
            "First, determine the language the job posting is written in, judging the posting as a whole (title, company, location, required skills, and the full description) rather than an isolated phrase. Report it in 'language' as a lowercase ISO 639-1 code such as 'en' or 'pt'.",
            "Then pick the master whose locale matches that language. Matching the posting's language is MORE important than matching its technical content: the candidate applies in the language of the posting.",
            "Only when several masters share the matching language should you choose between them on technical fit.",
            "Return exactly one of the provided names in the 'master' field.",
        ].join("\n"),
        prompt: `${jobBlock}\n\nMaster resumes:\n${masters.map((m) => m.summary).join("\n")}`,
        schema: selectSchema,
        label: "select-master",
    });

    const language = baseLanguage(result.language);
    const chosen = masters.find((m) => m.name === result.master);
    const sameLanguage = language ? masters.filter((m) => m.language === language) : [];

    // Trust the model's language detection over its master pick: if masters exist in the posting's
    // language but it chose one outside that set, correct it deterministically.
    if (sameLanguage.length > 0 && (!chosen || chosen.language !== language)) {
        if (sameLanguage.length === 1) {
            console.warn(
                `[select-master] job ${jobId}: posting is '${language}' but model chose "${result.master}"; using "${sameLanguage[0].name}"`,
            );
            return sameLanguage[0].name;
        }
        const narrowed = await ctx.llm.generate({
            system: [
                `The job posting is written in '${language}'. Every master resume below is written in that language.`,
                "Pick the one whose experience and skills best match the posting. Return exactly one of the provided names.",
            ].join("\n"),
            prompt: `${jobBlock}\n\nMaster resumes:\n${sameLanguage.map((m) => m.summary).join("\n")}`,
            schema: pickSchema,
            label: "select-master-narrowed",
        });
        const pick = sameLanguage.find((m) => m.name === narrowed.master) ?? sameLanguage[0];
        return pick.name;
    }

    if (chosen) {
        return chosen.name;
    }

    console.warn(`[select-master] job ${jobId}: model returned unknown master "${result.master}"; using "${names[0]}"`);
    return names[0];
}

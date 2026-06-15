import { z } from "zod/v4";
import type { AppContext } from "../context";

const selectSchema = z.object({
    master: z.string(),
    reason: z.string(),
});

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

    const summaries: string[] = [];
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
        summaries.push(`- "${name}": ${label}. ${summary} Skills: ${skills}. Roles: ${roles}`);
    }

    const system =
        "You pick which of the candidate's master resumes best fits a job. Return exactly one of the provided names in the 'master' field.";
    const prompt = [
        `Job: ${job.title} at ${job.company}${job.location ? ` (${job.location})` : ""}`,
        job.about ? `\n\nJob description:\n${job.about}` : "",
        job.skills.length ? `\n\nJob required skills: ${job.skills.join(", ")}` : "",
        `\n\nMaster resumes:\n${summaries.join("\n")}`,
    ].join("");

    const result = await ctx.llm.generate({ system, prompt, schema: selectSchema, label: "select-master" });
    return names.includes(result.master) ? result.master : names[0];
}

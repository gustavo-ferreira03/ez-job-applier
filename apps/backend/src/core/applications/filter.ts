import { z } from "zod/v4";
import type { AppContext } from "../context";
import type { Job } from "../types";
import type { LlmSettings } from "../../repositories/settings";

const filterSchema = z.object({
    apply: z.boolean(),
    reason: z.string(),
});

export async function shouldApply(
    job: Job,
    ctx: AppContext,
    settings: LlmSettings,
): Promise<{ apply: boolean; reason: string }> {
    const resumeText = await ctx.resumeRepo.getDefaultResumeText();

    const system = [
        "You are a job application filter. Decide whether to apply to a job based on the candidate's resume and their filter criteria.",
        " Always return the reason in English, regardless of the language used in the job description, resume, or filter criteria.",
        resumeText ? `\nResume:\n${resumeText}` : "",
        settings.filterCriteria ? `\nFilter criteria: ${settings.filterCriteria}` : "",
    ].join("");

    const prompt = [
        `Job: ${job.title} at ${job.company} (${job.location})`,
        job.about ? `\nDescription:\n${job.about}` : "",
        job.skills.length ? `\nRequired skills: ${job.skills.join(", ")}` : "",
    ].join("");

    return ctx.llm.generate({ system, prompt, schema: filterSchema, label: "filter" });
}

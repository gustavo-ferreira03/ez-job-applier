import { z } from "zod/v4";
import type { AppContext } from "../context";
import type { Job } from "../types";
import type { LlmSettings } from "../../repositories/settings";

const filterSchema = z.object({
    decision: z.enum(["apply", "reject", "needs_review"]),
    confidence: z.enum(["low", "medium", "high"]),
    evidence: z.string(),
    reason: z.string(),
});

function emptyAsUnknown(value: string | null | undefined): string {
    const text = value?.trim();
    return text ? text : "Unknown";
}

export async function shouldApply(
    job: Job,
    ctx: AppContext,
    settings: LlmSettings,
): Promise<{ apply: boolean; reason: string }> {
    const resumeText = await ctx.resumeRepo.getDefaultResumeText();

    const system = [
        "You are a conservative job application gatekeeper. Your job is to prevent clearly bad automatic submissions, not to rank jobs or optimize for perfect matches.",
        "Return all fields in English, regardless of the language used in the job description, resume, or filter criteria.",
        "Decision policy:",
        "- Use 'reject' only when the job clearly violates explicit filter criteria or has an explicit hard mismatch with the candidate profile.",
        "- Use 'apply' when the job is a reasonable fit.",
        "- Use 'needs_review' when important details are missing, ambiguous, or only weakly suggest a mismatch.",
        "- Do not reject because of missing nice-to-have skills, vague seniority wording, or missing salary/benefit details unless the filter criteria explicitly requires them.",
        "- Do not infer unstated requirements. Base the evidence on concrete job facts only.",
        "- Treat user filter criteria as higher priority than resume preferences.",
        "- A rejection should have high confidence and evidence that names the concrete mismatch.",
        resumeText ? `\nResume:\n${resumeText}` : "",
        settings.filterCriteria ? `\nFilter criteria:\n${settings.filterCriteria}` : "\nFilter criteria:\nNone provided",
    ].join("\n");

    const prompt = [
        "Evaluate this job for automatic application filtering.",
        `Title: ${emptyAsUnknown(job.title)}`,
        `Company: ${emptyAsUnknown(job.company)}`,
        `Location: ${emptyAsUnknown(job.location)}`,
        `Application route: ${job.applicationUrl ? "external ATS" : "provider quick apply"}`,
        `Preferences/tags: ${job.preferences.length ? job.preferences.join(", ") : "Unknown"}`,
        `Listed skills: ${job.skills.length ? job.skills.join(", ") : "Unknown"}`,
        `Description:\n${emptyAsUnknown(job.about)}`,
    ].join("\n");

    const decision = await ctx.llm.generate({ system, prompt, schema: filterSchema, label: "filter" });
    const shouldReject = decision.decision === "reject" && decision.confidence === "high";
    const prefix = shouldReject ? "Rejected" : "Allowed";
    const reason = `${prefix} by LLM filter (${decision.confidence} confidence): ${decision.reason} Evidence: ${decision.evidence}`;

    return { apply: !shouldReject, reason };
}

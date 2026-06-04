import { z } from "zod/v4";
import type { AppContext } from "../context";
import type { ApplicationStatus } from "../types";

const answerSchema = z.object({
    answers: z.array(z.object({
        label: z.string(),
        answer: z.string(),
    })),
});

export async function autoAnswer(
    appId: number,
    currentStatus: ApplicationStatus,
    ctx: AppContext,
): Promise<void> {
    const questions = await ctx.appRepo.getQuestions(appId);
    const unanswered = questions.filter((q) => !q.answer?.trim() && q.fieldType !== "file");
    if (!unanswered.length) return;

    const resumeText = await ctx.resumeRepo.getDefaultResumeText();

    const questionList = unanswered.map((q) => {
        const parts = [`- "${q.label}"`, q.fieldType ? ` (${q.fieldType})` : ""];
        if (q.options?.length) parts.push(` — options: ${q.options.join(", ")}`);
        return parts.join("");
    }).join("\n");

    const system = [
        "You are filling out a job application form on behalf of a candidate.",
        "Answer each question concisely and professionally based on the candidate's resume.",
        "For select/radio/checkbox fields, your answer must exactly match one of the provided options.",
        "Leave the answer as empty string if you cannot determine a reasonable answer.",
        resumeText ? `\nResume:\n${resumeText}` : "",
    ].join("");

    const prompt = `Fill in the following unanswered application questions:\n${questionList}`;

    const result = await ctx.llm.generate({ system, prompt, schema: answerSchema }).catch(() => null);
    if (!result) return;

    const filled: Record<string, string> = {};
    for (const { label, answer } of result.answers) {
        if (answer.trim()) filled[label] = answer.trim();
    }
    if (Object.keys(filled).length) {
        await ctx.appRepo.answerQuestions(appId, filled);
    }

    if (currentStatus === "NEEDS_INPUT") {
        const updated = await ctx.appRepo.getQuestions(appId);
        const allAnswered = updated.every((q) => q.fieldType === "file" || !!q.answer?.trim());
        if (allAnswered) {
            await ctx.appRepo.updateStatus(appId, "READY_FOR_REVIEW");
        }
    }
}

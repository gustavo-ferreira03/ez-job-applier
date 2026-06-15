import { z } from "zod/v4";
import type { AppContext } from "../context";
import { getSettings } from "../../repositories/settings";
import { scheduleAutoTailorIfNeeded } from "../resumes/auto-tailor";

const answerSchema = z.object({
    answers: z.array(z.object({
        label: z.string(),
        answer: z.string(),
    })),
});

async function processOne(
    jobId: number,
    resumeText: string | undefined,
    ctx: AppContext,
): Promise<void> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) return;
    const appRec = await ctx.appRepo.get(job.provider, job.jobId);
    if (!appRec) return;

    const questions = await ctx.appRepo.getQuestions(appRec.id);
    const unanswered = questions.filter((q) => !q.answer?.trim() && q.fieldType !== "file");
    if (!unanswered.length) return;

    const tag = `[auto-answer] "${job.title}"`;

    const questionList = unanswered.map((q) => {
        const parts = [`- "${q.label}"`, q.fieldType ? ` (${q.fieldType})` : ""];
        const opts = q.options?.filter((o) => o !== "Selecionar opção" && o !== "Select an option");
        if (opts?.length) parts.push(` — options: ${opts.join(", ")}`);
        return parts.join("");
    }).join("\n");

    const system = `You are filling out a job application form on behalf of a candidate.
Answer each question concisely and professionally based on the candidate's resume.
Always write free-text answers in English, regardless of the language used in the form or resume.
This application was submitted via LinkedIn job search.
For select/radio fields, your answer must exactly match one of the provided options.
For checkbox fields, you may select multiple options — return them comma-separated, each exactly matching one of the provided options (e.g. "Option A, Option C").
For number fields, output only digits and optionally one decimal point (e.g. '4', '4.5', '8000'). Never include currency symbols, commas, spaces, or units.
Return the label field EXACTLY as given, character for character.
Leave the answer as empty string only if truly impossible to determine.${resumeText ? `\n\nResume:\n${resumeText}` : ""}`;

    const prompt = `Fill in the following unanswered application questions:\n${questionList}`;

    let result: { answers: { label: string; answer: string }[] };
    try {
        result = await ctx.llm.generate({ system, prompt, schema: answerSchema, label: "auto-answer" });
    } catch (e) {
        console.warn(`${tag}: LLM could not answer (${unanswered.length} question(s) left for manual input)`);
        return;
    }

    const knownLabels = new Set(unanswered.map((q) => q.label));
    const toSave: Record<string, string> = {};
    const unmatched: string[] = [];
    for (const { label, answer } of result.answers) {
        if (!answer.trim()) continue;
        if (knownLabels.has(label)) toSave[label] = answer.trim();
        else unmatched.push(label);
    }

    if (unmatched.length) console.warn(`${tag}: LLM returned unmatched labels: ${unmatched.join(", ")}`);

    if (Object.keys(toSave).length) {
        await ctx.appRepo.answerQuestions(appRec.id, toSave);
        console.log(`${tag}: saved ${Object.keys(toSave).length} answer(s): ${Object.keys(toSave).join(", ")}`);
    } else {
        const llmEmpty = result.answers.filter((a) => !a.answer.trim()).length;
        console.log(`${tag}: no answers filled — LLM returned ${llmEmpty}/${result.answers.length} empty (${unanswered.length} left for manual input)`);
    }

    const updated = await ctx.appRepo.getQuestions(appRec.id);
    const allAnswered = updated.every((q) => q.fieldType === "file" || !!q.answer?.trim());
    if (allAnswered) {
        await ctx.appRepo.updateStatus(appRec.id, "READY_FOR_REVIEW");
        console.log(`${tag}: promoted to READY_FOR_REVIEW`);
        scheduleAutoTailorIfNeeded(jobId, ctx);
    }
}

export function createAutoAnswerWorker(ctx: AppContext, shouldStop: () => boolean) {
    let _wake: (() => void) | null = null;

    function workerSleep(ms: number): Promise<void> {
        return new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, ms);
            _wake = () => { clearTimeout(timer); resolve(); };
        });
    }

    async function run(): Promise<void> {
        const attempted = new Set<number>();
        const resumeText = await ctx.resumeRepo.getDefaultResumeText();

        while (!shouldStop()) {
            const exec = await ctx.executionRepo.getActive();
            if (exec?.status === "paused") {
                await workerSleep(5_000);
                continue;
            }

            const settings = await getSettings();
            if (!settings.llm.autoAnswer) {
                await workerSleep(30_000);
                continue;
            }

            const ids = await ctx.appRepo.listIdsByStatus("NEEDS_INPUT");
            const pending = ids.filter((id) => !attempted.has(id));

            if (pending.length === 0) {
                await workerSleep(30_000);
                continue;
            }

            for (const id of pending) attempted.add(id);
            console.log(`[auto-answer] processing ${pending.length} app(s)`);
            await Promise.all(pending.map((jobId) => processOne(jobId, resumeText, ctx)));
        }
    }

    function wake(): void {
        _wake?.();
        _wake = null;
    }

    return { run, wake };
}

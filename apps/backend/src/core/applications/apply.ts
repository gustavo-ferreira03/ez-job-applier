import type { AppContext } from "../context";
import { saveAnswers } from "./answer";
import { wakeExecution } from "../execution/manager";

function hasAnswer(answer: string | undefined): boolean {
    return answer !== undefined && answer.trim().length > 0;
}

export async function applyToJob(
    jobId: number,
    answers: Record<string, string> = {},
    ctx: AppContext,
    resumeFilename?: string,
): Promise<void> {
    const job = await ctx.jobRepo.getById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    await saveAnswers(jobId, answers, ctx);

    const application = await ctx.appRepo.get(job.provider, job.jobId);
    if (!application) throw new Error(`No application found for job ${jobId}`);

    const questions = await ctx.appRepo.getQuestions(application.id);
    const allAnswered = questions.every((q) => hasAnswer(q.answer));
    if (!allAnswered) throw new Error("All questions must be answered before applying");

    await ctx.appRepo.upsert(job.provider, job.jobId, "APPROVED", resumeFilename);

    wakeExecution();
}

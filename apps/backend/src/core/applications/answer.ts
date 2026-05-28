import { getJobById } from "../../repositories/jobs/services/storage";
import { getApplication, answerQuestions, getQuestions, updateApplicationStatus } from "../../repositories/applications/services/storage";

export async function saveAnswers(
    jobId: number,
    answers: Record<string, string>,
): Promise<void> {
    const job = await getJobById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const application = await getApplication(job.provider, job.jobId);
    if (!application) throw new Error(`No application found for job ${jobId}. Call POST /jobs/${jobId}/questions first.`);

    await answerQuestions(application.id, answers);

    const questions = await getQuestions(application.id);
    const allAnswered = questions.length > 0 && questions.every((q) => q.answer != null);
    if (allAnswered) {
        await updateApplicationStatus(application.id, "READY_FOR_REVIEW");
    }
}

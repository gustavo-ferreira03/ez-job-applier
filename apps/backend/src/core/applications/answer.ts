import { getJobById } from "../../repositories/jobs/services/storage";
import { getApplication, answerQuestions } from "../../repositories/applications/services/storage";

export async function saveAnswers(
    jobId: number,
    answers: Record<string, string>,
): Promise<void> {
    const job = await getJobById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const application = await getApplication(job.provider, job.jobId);
    if (!application) throw new Error(`No application found for job ${jobId}. Call POST /jobs/${jobId}/questions first.`);

    await answerQuestions(application.id, answers);
}

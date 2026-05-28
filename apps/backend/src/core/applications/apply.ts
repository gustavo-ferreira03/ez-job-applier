import { getProviderForJob } from "../registry";
import { getJobById } from "../../repositories/jobs/services/storage";
import {
    getApplication,
    getQuestions,
    upsertApplication,
    replaceQuestions,
} from "../../repositories/applications/services/storage";
import { getDefaultResume } from "../../repositories/resumes/services/settings";
import { RESUMES_DIR } from "../../repositories/resumes/services/storage";
import path from "node:path";
import type { ApplyResult } from "../types";

export async function applyToJob(
    jobId: number,
    answers: Record<string, string> = {},
    resumeFilename?: string,
): Promise<ApplyResult> {
    const job = await getJobById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const existing = await getApplication(job.provider, job.jobId);
    if (existing) {
        const persisted = await getQuestions(existing.id);
        for (const q of persisted) {
            if (q.answer && !answers[q.label]) {
                answers[q.label] = q.answer;
            }
        }
    }

    const filename = resumeFilename ?? (await getDefaultResume()) ?? undefined;
    const resumePath = filename ? path.join(RESUMES_DIR, filename) : undefined;

    const provider = getProviderForJob(job);
    const session = await provider.createSession();

    try {
        const result = await session.apply(job, answers, resumePath);

        const application = await upsertApplication(
            job.provider,
            job.jobId,
            result.status,
            filename,
            result.errorMessage,
        );
        await replaceQuestions(application.id, result.questions);

        return result;
    } finally {
        await session.close();
    }
}

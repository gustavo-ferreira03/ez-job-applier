import { getProviderForJob } from "../registry";
import { getJob } from "../../repositories/jobs/services/storage";
import {
    upsertApplication,
    replaceQuestions,
    getApplication,
    getQuestions,
} from "../../repositories/linkedin-applications/services/storage";
import {
    getDefaultResume,
} from "../../repositories/resumes/services/settings";
import { RESUMES_DIR } from "../../repositories/resumes/services/storage";
import path from "node:path";
import type { ApplyResult } from "../types";

export async function applyToJob(
    jobId: string,
    answers: Record<string, string> = {},
    resumeFilename?: string,
): Promise<ApplyResult> {
    const job = await getJob(jobId);
    if (!job) throw new Error(`Job "${jobId}" not found`);

    const provider = getProviderForJob(job);

    // Merge persisted answers with answers from the request
    const existing = await getApplication(jobId);
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

    const result = await provider.apply(job, answers, resumePath);

    const application = await upsertApplication(
        job.jobId,
        result.status,
        filename,
        result.errorMessage,
    );
    await replaceQuestions(application.id, result.questions);

    return result;
}

import { getProviderForJob } from "../registry";
import { getJobById } from "../../repositories/jobs/services/storage";
import { upsertApplication, replaceQuestions } from "../../repositories/applications/services/storage";
import { getDefaultResume } from "../../repositories/resumes/services/settings";
import { RESUMES_DIR } from "../../repositories/resumes/services/storage";
import path from "node:path";
import type { ApplyResult } from "../types";

export async function getQuestions(jobId: number): Promise<ApplyResult> {
    const job = await getJobById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    const provider = getProviderForJob(job);
    const session = await provider.createSession();

    try {
        const defaultResume = await getDefaultResume();
        const resumePath = defaultResume ? path.join(RESUMES_DIR, defaultResume) : undefined;

        const result = await session.getQuestions(job, resumePath);

        const application = await upsertApplication(
            job.provider,
            job.jobId,
            result.status,
            defaultResume ?? undefined,
            result.errorMessage,
        );
        await replaceQuestions(application.id, result.questions);

        return result;
    } finally {
        await session.close();
    }
}

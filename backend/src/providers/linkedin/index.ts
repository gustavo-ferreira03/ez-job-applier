import type { IJobProvider } from "../../core/interfaces";
import type { ApplyResult, DiscoverConfig, Job } from "../../core/types";
import {
    openLinkedinContext,
    closeLinkedinContext,
    saveLinkedinSession,
} from "./browser";
import { login } from "./services/auth";
import { discoverJobs as discoverJobsService } from "./services/jobs";
import { runEasyApply } from "./services/easyApply";
import type { SearchConfig } from "./services/types";

export const linkedinProvider: IJobProvider = {
    name: "linkedin",

    matchesJob(job: Job): boolean {
        return job.url.toLowerCase().includes("linkedin.com");
    },

    async *discoverJobs(
        config: DiscoverConfig,
        skipIds: Set<string>,
    ): AsyncGenerator<Job> {
        const context = await openLinkedinContext({ visible: false });
        const page = context.pages()[0] ?? (await context.newPage());

        try {
            await login(page);

            const searchConfig: SearchConfig = {
                keywords: config.keywords,
                location: config.location,
                easyApply: config.easyApply,
                workType: config.workType,
                experienceLevel: config.experienceLevel,
                jobType: config.jobType,
                datePosted: config.datePosted,
                maxJobs: config.maxJobs,
                skipJobIds: skipIds,
            };

            for await (const job of discoverJobsService(page, searchConfig)) {
                yield { ...job, provider: "linkedin" };
            }

            await saveLinkedinSession(context);
        } finally {
            await closeLinkedinContext(context);
        }
    },

    async getQuestions(job: Job, resumePath?: string): Promise<ApplyResult> {
        const context = await openLinkedinContext({ visible: false });
        const page = context.pages()[0] ?? (await context.newPage());

        try {
            await login(page);

            const result = await runEasyApply(page, job.url, {
                resumePath,
                shouldSubmit: false,
            });
            await saveLinkedinSession(context);
            return result;
        } finally {
            await closeLinkedinContext(context);
        }
    },

    async apply(
        job: Job,
        answers: Record<string, string>,
        resumePath?: string,
    ): Promise<ApplyResult> {
        const context = await openLinkedinContext({ visible: false });
        const page = context.pages()[0] ?? (await context.newPage());

        try {
            await login(page);

            const result = await runEasyApply(page, job.url, {
                answers,
                resumePath,
                shouldSubmit: true,
            });
            await saveLinkedinSession(context);
            return result;
        } finally {
            await closeLinkedinContext(context);
        }
    },
};

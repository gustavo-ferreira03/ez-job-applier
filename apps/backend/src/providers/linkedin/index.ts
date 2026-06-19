import type { IJobProvider, IJobProviderSession } from "../../core/interfaces";
import type { ApplyResult, DiscoverConfig, Job } from "../../core/types";
import {
    openLinkedinContext,
    closeLinkedinContext,
    saveLinkedinSession,
    openDetachedLinkedinContext,
} from "./browser";
import { login } from "./services/auth";
import { discoverJobs as discoverJobsService, fetchJobByUrl } from "./services/jobs";
import { runEasyApply } from "./services/easyApply";
import type { SearchConfig } from "./services/types";
import { getSettings } from "../../repositories/settings";

export const linkedinProvider: IJobProvider = {
    name: "linkedin",

    matchesJob(job: Job): boolean {
        return job.url.toLowerCase().includes("linkedin.com");
    },

    async fetchJobDetails(url: string): Promise<Partial<Job>> {
        const { advanced: { searchLocale } } = await getSettings();
        const context = await openDetachedLinkedinContext({ visible: false, searchLocale });
        try {
            const page = context.pages()[0] ?? (await context.newPage());
            return await fetchJobByUrl(page, url);
        } finally {
            await context.close().catch(() => undefined);
        }
    },

    async createSession(): Promise<IJobProviderSession> {
        const { advanced: { browserVisible, searchLocale } } = await getSettings();
        const context = await openLinkedinContext({
            visible: browserVisible,
            searchLocale,
            display: process.env.LINKEDIN_BROWSER_DISPLAY,
        });

        let discoveryPage;
        let applyPage;
        try {
            discoveryPage = context.pages()[0] ?? (await context.newPage());
            applyPage = await context.newPage();
            await login(discoveryPage);
        } catch (e) {
            await closeLinkedinContext(context);
            throw e;
        }

        return {
            async *discoverJobs(
                config: DiscoverConfig,
                skipIds: Set<string>,
            ): AsyncGenerator<Job> {
                const opts = config.options ?? {};
                const searchConfig: SearchConfig = {
                    keywords: config.keywords,
                    location: config.location,
                    workType: config.workType,
                    experienceLevel: config.experienceLevel,
                    jobType: config.jobType,
                    datePosted: config.datePosted,
                    maxJobs: config.maxJobs,
                    skipJobIds: skipIds,
                    easyApply: opts.easyApply === true,
                    under10Applicants: opts.under10Applicants === true,
                    inMyNetwork: opts.inMyNetwork === true,
                    includeTopApplicant: opts.includeTopApplicant === true,
                    fillSkillGaps: opts.fillSkillGaps === true,
                };

                for await (const job of discoverJobsService(discoveryPage, searchConfig)) {
                    yield { ...job, provider: "linkedin" };
                }
            },

            async getQuestions(job: Job, resumePath?: string): Promise<ApplyResult> {
                return runEasyApply(applyPage, job.url, {
                    resumePath,
                    shouldSubmit: false,
                });
            },

            async apply(
                job: Job,
                answers: Record<string, string>,
                resumePath?: string,
            ): Promise<ApplyResult> {
                return runEasyApply(applyPage, job.url, {
                    answers,
                    resumePath,
                    shouldSubmit: true,
                });
            },

            async close(): Promise<void> {
                await saveLinkedinSession(context);
                await closeLinkedinContext(context);
            },
        };
    },
};

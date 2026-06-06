import type { AppContext } from "../context";
import type { ApplicationStatus, Job } from "../types";
import { extractLinkedinJobId } from "../../providers/linkedin/services/jobs";

export type AddManualStatus = "scraping" | "reactivated" | "exists";

const REACTIVATABLE_STATUSES = new Set<ApplicationStatus>(["REJECTED", "FAILED"]);

export function parseManualJobUrl(raw: string): {
    provider: string;
    externalId: string;
    url: string;
} {
    let parsed: URL;
    try {
        parsed = new URL(raw.trim());
    } catch {
        throw new Error("Invalid URL");
    }
    if (!parsed.hostname.toLowerCase().includes("linkedin.com")) {
        throw new Error("Only LinkedIn job links are supported for now");
    }
    const externalId = extractLinkedinJobId(raw);
    if (!externalId) throw new Error("Could not find a LinkedIn job id in that URL");
    return {
        provider: "linkedin",
        externalId,
        url: `https://www.linkedin.com/jobs/view/${externalId}/`,
    };
}

export async function addManualJob(
    rawUrl: string,
    ctx: AppContext,
): Promise<{ status: AddManualStatus }> {
    const { provider, externalId, url } = parseManualJobUrl(rawUrl);

    const existing = await ctx.jobRepo.getByProvider(provider, externalId);
    if (existing) {
        const app = await ctx.appRepo.get(provider, externalId);
        if (app && !REACTIVATABLE_STATUSES.has(app.status)) {
            return { status: "exists" };
        }
        const rec = await ctx.appRepo.upsert(provider, externalId, "FOUND");
        if (existing.about === null) {
            await ctx.appRepo.setProcessing(rec.id, true);
            scrapeJob(ctx, existing);
        }
        return { status: "reactivated" };
    }

    const placeholder: Job = {
        jobId: externalId,
        provider,
        title: `LinkedIn job ${externalId}`,
        company: "",
        location: "",
        url,
        preferences: [],
        skills: [],
        about: null,
        applicationUrl: null,
    };
    await ctx.jobRepo.save(placeholder);
    const app = await ctx.appRepo.upsert(provider, externalId, "FOUND");
    await ctx.appRepo.setProcessing(app.id, true);

    scrapeJob(ctx, placeholder);
    return { status: "scraping" };
}

async function scrapeJob(ctx: AppContext, job: Job): Promise<void> {
    const app = await ctx.appRepo.get(job.provider, job.jobId);
    try {
        const details = await ctx.providerRegistry.get(job.provider).fetchJobDetails(job.url);
        await ctx.jobRepo.save({
            ...job,
            title: details.title || job.title,
            company: details.company ?? job.company,
            location: details.location ?? job.location,
            preferences: details.preferences ?? job.preferences,
            skills: details.skills ?? job.skills,
            about: details.about ?? "",
            applicationUrl: details.applicationUrl ?? job.applicationUrl,
        });
        if (app) await ctx.appRepo.setProcessing(app.id, false);
    } catch (e) {
        console.error("[manual] scrape failed:", e);
        if (app) {
            await ctx.appRepo.updateStatus(app.id, "FAILED", String(e));
            await ctx.appRepo.setProcessing(app.id, false);
        }
    }
}

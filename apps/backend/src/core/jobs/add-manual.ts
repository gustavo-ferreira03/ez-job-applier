import crypto from "node:crypto";
import { z } from "zod/v4";
import type { AppContext } from "../context";
import type { ApplicationStatus, Job } from "../types";
import { extractLinkedinJobId } from "../../providers/linkedin/services/jobs";
import { fetchPageText } from "./fetch-page-text";

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
    if (parsed.hostname.toLowerCase().includes("linkedin.com")) {
        const externalId = extractLinkedinJobId(raw);
        if (!externalId) throw new Error("Could not find a LinkedIn job id in that URL");
        return {
            provider: "linkedin",
            externalId,
            url: `https://www.linkedin.com/jobs/view/${externalId}/`,
        };
    }
    const normalized = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
    const externalId = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 16);
    return { provider: "external", externalId, url: parsed.toString() };
}

export async function addManualJob(
    rawUrl: string,
    ctx: AppContext,
    options: { awaitScrape?: boolean } = {},
): Promise<{ status: AddManualStatus; jobId?: number }> {
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
            const scrape = provider === "linkedin" ? scrapeJob(ctx, existing) : scrapeExternalJob(ctx, existing);
            if (options.awaitScrape) await scrape;
        }
        return { status: "reactivated", jobId: (await ctx.jobRepo.getIdByProvider(provider, externalId)) ?? undefined };
    }

    const isExternal = provider !== "linkedin";
    const placeholder: Job = {
        jobId: externalId,
        provider,
        title: isExternal ? new URL(url).hostname.replace(/^www\./, "") : `LinkedIn job ${externalId}`,
        company: "",
        location: "",
        url,
        preferences: [],
        skills: [],
        about: null,
        applicationUrl: isExternal ? url : null,
    };
    await ctx.jobRepo.save(placeholder);
    const app = await ctx.appRepo.upsert(provider, externalId, "FOUND");
    await ctx.appRepo.setProcessing(app.id, true);

    const scrape = isExternal ? scrapeExternalJob(ctx, placeholder) : scrapeJob(ctx, placeholder);
    if (options.awaitScrape) await scrape;
    return {
        status: "scraping",
        jobId: (await ctx.jobRepo.getIdByProvider(provider, externalId)) ?? undefined,
    };
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

const externalJobSchema = z.object({
    title: z.string(),
    company: z.string(),
    location: z.string(),
    about: z.string(),
});

async function scrapeExternalJob(ctx: AppContext, job: Job): Promise<boolean> {
    const app = await ctx.appRepo.get(job.provider, job.jobId);
    try {
        const page = await fetchPageText(job.url);
        const text = page?.text.slice(0, 12_000) ?? "";
        if (!text) return false;

        const parsed = await ctx.llm.generate({
            system: "Extract the job posting fields from the rendered page text. Use empty strings for anything not present. Do not invent.",
            prompt: `URL: ${job.url}\nPage title: ${page?.title ?? ""}\n\nPage text:\n${text}`,
            schema: externalJobSchema,
            label: "external-job-parse",
        });
        const about = parsed.about.trim();
        await ctx.jobRepo.save({
            ...job,
            title: parsed.title.trim() || page?.title?.trim() || job.title,
            company: parsed.company.trim() || job.company,
            location: parsed.location.trim() || job.location,
            about,
        });
        return about.length > 0;
    } catch (e) {
        console.error("[manual] external scrape failed:", e);
        return false;
    } finally {
        if (app) await ctx.appRepo.setProcessing(app.id, false);
    }
}

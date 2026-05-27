import type { Locator, Page } from "playwright-core";
import type { Job, SearchConfig } from "./types";

const EXP_MAP: Record<string, string> = {
    entry: "2",
    associate: "3",
    mid_senior: "4",
    director: "5",
    executive: "6",
};
const JT_MAP: Record<string, string> = {
    full_time: "F",
    part_time: "P",
    contract: "C",
    temporary: "T",
    internship: "I",
};
const WT_MAP: Record<string, string> = {
    remote: "2",
    hybrid: "3",
    onsite: "1",
};
const DATE_MAP: Record<string, string> = {
    hour: "r3600",
    hours6: "r21600",
    hours12: "r43200",
    hours24: "r86400",
    day: "r86400",
    week: "r604800",
    month: "r2592000",
};

function isAuthWall(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes("/login") || lower.includes("checkpoint");
}

function cleanText(text: string): string {
    return text
        .replace(/\n{3,}/g, "\n\n")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join("\n");
}

function cleanListItems(texts: string[]): string[] {
    return texts
        .map((t) => cleanText(t).split("\n")[0])
        .filter((t) => t.length > 0);
}

function buildSearchUrl(config: SearchConfig, start: number): string {
    const wtParts = (config.workType ?? "")
        .split(",")
        .map((w) => w.trim())
        .filter((w) => w in WT_MAP)
        .map((w) => WT_MAP[w]);

    const expParts = (config.experienceLevel ?? [])
        .filter((e) => e in EXP_MAP)
        .map((e) => EXP_MAP[e]);

    const jtParts = (config.jobType ?? [])
        .filter((j) => j in JT_MAP)
        .map((j) => JT_MAP[j]);

    const params = new URLSearchParams();
    if (config.keywords) params.set("keywords", config.keywords);
    if (config.location) params.set("location", config.location);
    if (config.easyApply) params.set("f_AL", "true");
    if (wtParts.length) params.set("f_WT", wtParts.join(","));
    if (expParts.length) params.set("f_E", expParts.join(","));
    if (jtParts.length) params.set("f_JT", jtParts.join(","));
    if (config.datePosted && DATE_MAP[config.datePosted])
        params.set("f_TPR", DATE_MAP[config.datePosted]);
    if (start) params.set("start", String(start));

    const query = params.toString();
    return "https://www.linkedin.com/jobs/search/" + (query ? `?${query}` : "");
}

async function openJobs(
    page: Page,
    config: SearchConfig,
    start: number,
): Promise<void> {
    const url = buildSearchUrl(config, start);
    console.log(`Opening jobs page: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    if (isAuthWall(page.url()))
        throw new Error("LinkedIn session expired; log in again");
    await page.waitForTimeout(5000);
}

async function openTopApplicant(page: Page, start: number): Promise<void> {
    const url =
        "https://www.linkedin.com/jobs/collections/top-applicant/" +
        (start ? `?start=${start}` : "");
    console.log(`Opening top applicant collection: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    if (isAuthWall(page.url()))
        throw new Error("LinkedIn session expired; log in again");
    await page.waitForTimeout(5000);
}

async function loadJobIds(page: Page): Promise<string[]> {
    try {
        await page.waitForSelector("li[data-occludable-job-id]", {
            timeout: 30000,
        });
    } catch {
        console.log("No job cards found");
        return [];
    }

    const jobIds: string[] = [];
    for (let i = 0; i < 30; i++) {
        const before = jobIds.length;
        const cards = page.locator("li[data-occludable-job-id]");
        const count = await cards.count();
        for (let j = 0; j < count; j++) {
            const id = await cards
                .nth(j)
                .getAttribute("data-occludable-job-id");
            if (id && !jobIds.includes(id)) jobIds.push(id);
        }
        await cards.last().scrollIntoViewIfNeeded();
        await page.mouse.wheel(0, 2000);
        await page.waitForTimeout(1200);
        if (jobIds.length === before) break;
    }

    console.log(`Loaded ${jobIds.length} jobs`);
    return jobIds;
}

async function getApplicationUrl(
    page: Page,
    detailPane: Locator,
    easyApply: boolean,
): Promise<string | null> {
    if (easyApply) return null;

    let applyControl = detailPane
        .getByRole("link")
        .filter({ hasText: "Apply" })
        .first();
    if (!(await applyControl.count())) {
        applyControl = detailPane
            .getByRole("button")
            .filter({ hasText: "Apply" })
            .first();
    }
    if (!(await applyControl.count())) return null;

    const currentUrl = page.url();
    try {
        const [popup] = await Promise.all([
            page.waitForEvent("popup", { timeout: 5000 }),
            applyControl.click({ timeout: 3000 }),
        ]);
        await popup.waitForLoadState("domcontentloaded", { timeout: 10000 });
        const applicationUrl = popup.url();
        await popup.close();
        return applicationUrl;
    } catch {
        await page.waitForTimeout(2000);
        if (page.url() === currentUrl) return null;
        const applicationUrl = page.url();
        await page.goBack({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1000);
        return applicationUrl;
    }
}

async function addMissingSkills(page: Page, skillsUl: Locator): Promise<void> {
    const lis = skillsUl.locator("li");
    const count = await lis.count();
    for (let i = 0; i < count; i++) {
        const li = lis.nth(i);
        let addBtn = li
            .getByRole("button")
            .filter({ hasText: /^add$/i })
            .first();
        if (!(await addBtn.count()))
            addBtn = li.locator("button[aria-label*='Add']").first();
        if (!(await addBtn.count())) continue;

        await addBtn.click();
        await page.waitForTimeout(1500);
        const dialog = page.getByRole("dialog").last();
        if (await dialog.count()) {
            const saveBtn = dialog
                .getByRole("button", { name: /save/i })
                .first();
            if (await saveBtn.count()) {
                await saveBtn.click();
                await page.waitForTimeout(1000);
                const closeBtn = page
                    .getByRole("button", { name: /dismiss|close/i })
                    .first();
                if (await closeBtn.count()) {
                    await closeBtn.click();
                    await page.waitForTimeout(500);
                }
            }
        }
    }
}

async function getJobDetails(
    page: Page,
    easyApply: boolean,
    fillSkillGaps: boolean,
): Promise<Partial<Job>> {
    const detailPane = page
        .locator(
            ".jobs-search__job-details--container, .job-view-layout, .jobs-details, .scaffold-layout__detail",
        )
        .first();

    const title = (await detailPane.locator("h1").first().innerText())
        .split("\n")[0]
        .trim();

    const aboutSection = detailPane
        .locator("article")
        .filter({ hasText: "About the job" })
        .first();
    await aboutSection.locator("p, li").first().waitFor();
    const about = await aboutSection.innerText();

    let preferences: string[] = [];
    let skills: string[] = [];

    const skillsBtn = detailPane
        .getByRole("button")
        .filter({ hasText: /skills match/i })
        .first();
    if (await skillsBtn.count()) {
        await skillsBtn.click();
        const modal = page.getByRole("dialog", {
            name: "Preferences and skills match",
        });
        await modal.waitFor();
        preferences = cleanListItems(
            await modal.locator("ul").first().locator("li").allInnerTexts(),
        );
        const skillsUl = modal.locator("ul").nth(1);
        skills = cleanListItems(await skillsUl.locator("li").allInnerTexts());
        if (fillSkillGaps) await addMissingSkills(page, skillsUl);
        await modal.getByRole("button", { name: "Dismiss" }).click();
    }

    const applicationUrl = await getApplicationUrl(page, detailPane, easyApply);

    return {
        title,
        preferences,
        skills,
        about: cleanText(about).replace(/^About the job\s*/i, ""),
        applicationUrl,
    };
}

async function* extractJobs(
    page: Page,
    maxJobs?: number,
    fillSkillGaps = false,
): AsyncGenerator<Job> {
    let count = 0;
    const jobIds = await loadJobIds(page);
    const limited = maxJobs != null ? jobIds.slice(0, maxJobs) : jobIds;

    for (const jobId of limited) {
        const card = page
            .locator(`li[data-occludable-job-id="${jobId}"]`)
            .first();
        await card.scrollIntoViewIfNeeded();

        const link = card.locator('a[href*="/jobs/view/"]').first();
        const title = await link.innerText();
        const href = (await link.getAttribute("href")) ?? "";

        const labels = (
            await card
                .locator(".job-card-container__footer-item")
                .allInnerTexts()
        ).map((t) => t.trim());

        if (labels.some((l) => l.toLowerCase() === "applied")) {
            console.log(`Skipping already-applied job: ${jobId}`);
            continue;
        }

        await card.click();
        await page.waitForTimeout(1000);

        const easyApply = labels.some((l) =>
            l.toLowerCase().includes("easy apply"),
        );
        const details = await getJobDetails(page, easyApply, fillSkillGaps);

        const job: Job = {
            jobId,
            title: title.split("\n")[0].trim(),
            company: (
                await card
                    .locator(".artdeco-entity-lockup__subtitle")
                    .first()
                    .innerText()
            ).trim(),
            location: (
                await card
                    .locator(".artdeco-entity-lockup__caption")
                    .first()
                    .innerText()
            ).trim(),
            url: new URL(href, "https://www.linkedin.com").href,
            easyApply,
            preferences: details.preferences ?? [],
            skills: details.skills ?? [],
            about: details.about ?? null,
            applicationUrl: details.applicationUrl ?? null,
        };

        count++;
        console.log(`Extracted ${count}: ${job.title}`);
        yield job;
    }

    console.log(`Extracted ${count} jobs`);
}

export async function* discoverJobs(
    page: Page,
    config: SearchConfig,
): AsyncGenerator<Job> {
    const keywordsList = (config.keywords ?? "")
        .split("\n")
        .map((k) => k.trim())
        .filter((k) => k.length > 0);

    if (keywordsList.length === 0) keywordsList.push("");

    let total = 0;
    const seenIds = new Set<string>();

    while (true) {
        let anyFound = false;

        if (config.includeTopApplicant) {
            let start = 0;
            while (true) {
                if (config.maxJobs != null && total >= config.maxJobs) break;
                await openTopApplicant(page, start);
                const remaining =
                    config.maxJobs != null ? config.maxJobs - total : undefined;
                let pageNew = 0;
                for await (const job of extractJobs(
                    page,
                    remaining,
                    config.fillSkillGaps,
                )) {
                    if (!seenIds.has(job.jobId)) {
                        seenIds.add(job.jobId);
                        total++;
                        pageNew++;
                        anyFound = true;
                        yield job;
                    }
                }
                if (pageNew === 0) break;
                start += 25;
            }
        }

        for (const keyword of keywordsList) {
            let start = 0;
            while (true) {
                if (config.maxJobs != null && total >= config.maxJobs) return;
                await openJobs(
                    page,
                    { ...config, keywords: keyword || undefined },
                    start,
                );
                const remaining =
                    config.maxJobs != null ? config.maxJobs - total : undefined;
                let pageNew = 0;
                for await (const job of extractJobs(
                    page,
                    remaining,
                    config.fillSkillGaps,
                )) {
                    if (!seenIds.has(job.jobId)) {
                        seenIds.add(job.jobId);
                        total++;
                        pageNew++;
                        anyFound = true;
                        yield job;
                    }
                }
                if (pageNew === 0) break;
                start += 25;
            }
        }

        if (config.maxJobs != null || !anyFound) break;
    }
}

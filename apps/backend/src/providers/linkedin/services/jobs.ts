import type { Locator, Page } from "playwright-core";
import type { LinkedinJob, SearchConfig } from "./types";

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
    const params = new URLSearchParams();
    if (config.keywords) params.set("keywords", config.keywords);
    if (config.location) params.set("location", config.location);
    if (start) params.set("start", String(start));

    const query = params.toString();
    return "https://www.linkedin.com/jobs/search-results/" + (query ? `?${query}` : "");
}

async function clickDropdownOption(page: Page, triggerLabel: RegExp, optionLabel: RegExp): Promise<boolean> {
    const trigger = page.getByRole("button").filter({ hasText: triggerLabel }).first();
    if (!(await trigger.count())) {
        console.log(`[filter] trigger not found: ${triggerLabel.source}`);
        return false;
    }

    await trigger.click();
    await page.waitForTimeout(400);

    const radio = page.getByRole("radio").filter({ hasText: optionLabel }).first();
    if (await radio.count()) {
        await radio.click();
        await page.waitForTimeout(600);
        return true;
    }

    const btn = page.getByRole("button").filter({ hasText: optionLabel }).first();
    if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(600);
        return true;
    }

    console.log(`[filter] option not found: ${optionLabel.source}`);
    return false;
}

async function toggleFilterPill(page: Page, label: RegExp): Promise<boolean> {
    const pill = page.locator("button, a, label").filter({ hasText: label }).first();
    if (!(await pill.count())) {
        console.log(`[filter] pill not found: ${label.source}`);
        return false;
    }

    const ariaPressed = await pill.getAttribute("aria-pressed");
    const isChecked = ariaPressed === "true" || await pill.evaluate((el) => (el as HTMLInputElement).checked);

    if (!isChecked) {
        await pill.click();
        await page.waitForTimeout(800);
        console.log(`[filter] toggled pill: ${label.source}`);
        return true;
    }

    console.log(`[filter] pill already active: ${label.source}`);
    return true;
}

async function applyFiltersViaUI(page: Page, config: SearchConfig): Promise<void> {
    const applied: string[] = [];

    if (config.easyApply) {
        if (await toggleFilterPill(page, /^\s*Easy Apply\s*$/i)) {
            applied.push("Easy Apply");
        }
    }

    if (config.datePosted) {
        const dateMap: Record<string, RegExp> = {
            hour: /past hour/i,
            hours6: /past 6 hours/i,
            hours12: /past 12 hours/i,
            hours24: /past 24 hours|last 24 hours/i,
            day: /past 24 hours|last 24 hours|past day/i,
            week: /past week|last week/i,
            month: /past month|last month/i,
        };
        const pattern = dateMap[config.datePosted];
        if (pattern && await clickDropdownOption(page, /date posted/i, pattern)) {
            applied.push(`Date posted: ${config.datePosted}`);
        }
    }

    if (config.workType) {
        const wtMap: Record<string, RegExp> = {
            remote: /remote/i,
            hybrid: /hybrid/i,
            onsite: /on-site|onsite/i,
        };
        const pattern = wtMap[config.workType];
        if (pattern && await clickDropdownOption(page, /workplace type|work type|on-site/i, pattern)) {
            applied.push(`Work type: ${config.workType}`);
        }
    }

    if (config.experienceLevel && config.experienceLevel.length > 0) {
        const expMap: Record<string, RegExp> = {
            entry: /internship|entry level/i,
            associate: /associate/i,
            mid_senior: /mid-senior level|mid senior/i,
            director: /director/i,
            executive: /executive/i,
        };
        for (const level of config.experienceLevel) {
            const pattern = expMap[level];
            if (pattern && await clickDropdownOption(page, /experience level/i, pattern)) {
                applied.push(`Experience: ${level}`);
            }
        }
    }

    if (config.jobType && config.jobType.length > 0) {
        const jtMap: Record<string, RegExp> = {
            full_time: /full-time|full time/i,
            part_time: /part-time|part time/i,
            contract: /contract/i,
            temporary: /temporary/i,
            internship: /internship/i,
        };
        for (const jt of config.jobType) {
            const pattern = jtMap[jt];
            if (pattern && await clickDropdownOption(page, /job type|employment type/i, pattern)) {
                applied.push(`Job type: ${jt}`);
            }
        }
    }

    if (applied.length > 0) {
        console.log(`[jobs] applied filters: ${applied.join(", ")}`);
        await page.waitForTimeout(2000);
        console.log(`[jobs] final URL after filters: ${page.url()}`);
    }
}

async function openJobs(page: Page, config: SearchConfig, start: number): Promise<void> {
    const url = buildSearchUrl(config, start);
    console.log(`[jobs] navigating to: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const finalUrl = page.url();
    console.log(`[jobs] landed on: ${finalUrl}`);
    if (isAuthWall(finalUrl))
        throw new Error("LinkedIn session expired; log in again");
    await page.waitForTimeout(3000);
    await applyFiltersViaUI(page, config);
}

async function openTopApplicant(page: Page, start: number): Promise<void> {
    const url = "https://www.linkedin.com/jobs/collections/top-applicant/" + (start ? `?start=${start}` : "");
    console.log(`Opening top applicant collection: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    if (isAuthWall(page.url()))
        throw new Error("LinkedIn session expired; log in again");
    await page.waitForTimeout(5000);
}

// Cards are div[role="button"][componentkey] inside the first lazy-column.
// Each card appears multiple times in the virtual list; dedup by componentkey.
const CARD_SELECTOR = "[data-testid='lazy-column'] div[role='button'][componentkey]";

async function hasNoResults(page: Page): Promise<boolean> {
    const noResults = page.locator("text='No results found'").first();
    if (await noResults.count()) return true;
    const noResultsHeading = page.locator("h1, h2, h3").filter({ hasText: /no results found/i }).first();
    return !!(await noResultsHeading.count());
}

async function loadCardKeys(page: Page): Promise<string[]> {
    if (await hasNoResults(page)) {
        console.log("No results page detected");
        return [];
    }
    try {
        await page.waitForSelector(CARD_SELECTOR, { timeout: 30000 });
    } catch {
        console.log("No job cards found");
        return [];
    }

    const keys: string[] = [];
    for (let i = 0; i < 30; i++) {
        const before = keys.length;
        const cardBtns = page
            .locator("[data-testid='lazy-column']")
            .first()
            .locator("div[role='button'][componentkey]");
        const count = await cardBtns.count();
        for (let j = 0; j < count; j++) {
            const key = await cardBtns.nth(j).getAttribute("componentkey");
            if (key && !keys.includes(key)) keys.push(key);
        }
        if (count > 0) {
            await cardBtns.last().scrollIntoViewIfNeeded();
            await page.mouse.wheel(0, 2000);
            await page.waitForTimeout(1200);
        }
        if (keys.length === before) break;
    }

    console.log(`Loaded ${keys.length} job cards`);
    return keys;
}

function parseCardText(text: string): { title: string; company: string; location: string } {
    const parts = text.split("\n\n");
    // Title block: may have "Job Title (Verified job)\nJob Title" — take last non-empty line
    const titleLines = parts[0].split("\n").map((l) => l.trim()).filter(Boolean);
    const title = titleLines[titleLines.length - 1] ?? "";
    const company = (parts[1] ?? "").trim();
    const location = (parts[2] ?? "").trim();
    return { title, company, location };
}

async function getApplicationUrl(page: Page, detailPane: Locator, easyApply: boolean): Promise<string | null> {
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

    // Extract URL directly from LinkedIn safety redirect href when available
    const href = await applyControl.getAttribute("href").catch(() => null);
    if (href) {
        const match = href.match(/[?&]url=([^&]+)/);
        if (match) return decodeURIComponent(match[1]);
        if (!href.includes("linkedin.com")) return href;
    }

    // Fallback: click and capture popup or navigation
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
            const saveBtn = dialog.getByRole("button", { name: /save/i }).first();
            if (await saveBtn.count()) {
                await saveBtn.click();
                await page.waitForTimeout(1000);
                const closeBtn = page.getByRole("button", { name: /dismiss|close/i }).first();
                if (await closeBtn.count()) {
                    await closeBtn.click();
                    await page.waitForTimeout(500);
                }
            }
        }
    }
}

async function getJobDetails(page: Page, easyApply: boolean, fillSkillGaps: boolean): Promise<Partial<LinkedinJob>> {
    const detailPane = page
        .locator("[data-sdui-screen='com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails']")
        .first();

    // About section: the H2 is wrapped in a single-child div; actual content is 2 levels up
    const aboutH2 = detailPane.locator("h2").filter({ hasText: /about the job/i }).first();
    const aboutContainer = aboutH2.locator("xpath=../.."); // grandparent holds H2 wrapper + content siblings
    await aboutContainer.locator("p, li").first().waitFor({ timeout: 10000 });
    const rawAbout = await aboutContainer.innerText();
    const about = rawAbout.replace(/^About the job\s*/i, "").trim();

    let preferences: string[] = [];
    let skills: string[] = [];

    const skillsBtn = detailPane.getByRole("button").filter({ hasText: /skills match/i }).first();
    if (await skillsBtn.count()) {
        await skillsBtn.click();
        const modal = page.getByRole("dialog").last();
        await modal.waitFor();
        preferences = cleanListItems(await modal.locator("ul").first().locator("li").allInnerTexts());
        const skillsUl = modal.locator("ul").nth(1);
        skills = cleanListItems(await skillsUl.locator("li").allInnerTexts());
        if (fillSkillGaps) await addMissingSkills(page, skillsUl);
        const dismissBtn = modal.getByRole("button", { name: /dismiss|close/i }).first();
        if (await dismissBtn.count()) await dismissBtn.click();
    }

    const applicationUrl = await getApplicationUrl(page, detailPane, easyApply);

    return {
        preferences,
        skills,
        about: cleanText(about),
        applicationUrl,
    };
}

async function* extractJobs(
    page: Page,
    maxJobs?: number,
    fillSkillGaps = false,
    skipJobIds = new Set<string>(),
    onCandidate?: (key: string) => void,
): AsyncGenerator<LinkedinJob> {
    let count = 0;
    const cardKeys = await loadCardKeys(page);

    for (const key of cardKeys) {
        if (maxJobs != null && count >= maxJobs) break;
        onCandidate?.(key);

        const lazyCol = page.locator("[data-testid='lazy-column']").first();
        const cardBtn = lazyCol.locator(`div[role='button'][componentkey='${key}']`).first();
        await cardBtn.scrollIntoViewIfNeeded();

        const cardText = await cardBtn.innerText();
        const { title, company, location } = parseCardText(cardText);

        if (!company) continue;

        if (/\bapplied\b/i.test(cardText)) {
            console.log(`Skipping already-applied job: ${title}`);
            continue;
        }

        await cardBtn.click();
        await page.waitForTimeout(1500);

        const jobId = new URL(page.url()).searchParams.get("currentJobId");
        if (!jobId) {
            console.log(`Could not get job ID for: ${title}`);
            continue;
        }

        if (skipJobIds.has(jobId)) {
            console.log(`Skipping already-saved job: ${jobId}`);
            continue;
        }

        const easyApply = /easy apply/i.test(cardText);
        const details = await getJobDetails(page, easyApply, fillSkillGaps);

        const job: LinkedinJob = {
            jobId,
            provider: "linkedin",
            title,
            company,
            location,
            url: `https://www.linkedin.com/jobs/view/${jobId}/`,
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
): AsyncGenerator<LinkedinJob> {
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
                const remaining = config.maxJobs != null ? config.maxJobs - total : undefined;
                let pageNew = 0;
                for await (const job of extractJobs(
                    page,
                    remaining,
                    config.fillSkillGaps,
                    config.skipJobIds,
                    () => pageNew++,
                )) {
                    if (!seenIds.has(job.jobId)) {
                        seenIds.add(job.jobId);
                        total++;
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
                await openJobs(page, { ...config, keywords: keyword || undefined }, start);
                const remaining = config.maxJobs != null ? config.maxJobs - total : undefined;
                let pageNew = 0;
                for await (const job of extractJobs(
                    page,
                    remaining,
                    config.fillSkillGaps,
                    config.skipJobIds,
                    () => pageNew++,
                )) {
                    if (!seenIds.has(job.jobId)) {
                        seenIds.add(job.jobId);
                        total++;
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

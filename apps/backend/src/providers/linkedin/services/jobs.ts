import type { Locator, Page } from "playwright-core";
import type { LinkedinJob, SearchConfig } from "./types";
import { trySavedAccountLogin } from "./auth";

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

const WT_MAP: Record<string, string> = { onsite: "1", remote: "2", hybrid: "3" };
const WT_SAL_MAP: Record<string, string> = { remote: "272001" };
const EXP_SAL_MAP: Record<string, string> = {
    entry: "276001",
    senior: "277001",
    manager: "278001",
    director: "272003",
    executive: "279001",
};
const JT_SAL_MAP: Record<string, string> = {
    part_time: "273001",
    contract: "274001",
    internship: "275001",
    full_time: "272015",
    volunteer: "272002",
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

async function resolveGeoId(page: Page, location: string): Promise<string | null> {
    const url = `https://www.linkedin.com/jobs-guest/api/typeaheadHits?query=${encodeURIComponent(location)}&typeaheadType=GEO`;
    try {
        const res = await page.request.get(url);
        if (!res.ok()) return null;
        const hits = (await res.json()) as Array<{ id?: string; type?: string }>;
        const first = hits.find((h) => h.type === "GEO" && h.id) ?? hits[0];
        return first?.id ?? null;
    } catch (e) {
        console.log(`[jobs] geoId lookup failed for "${location}": ${String(e)}`);
        return null;
    }
}

function semanticGroup(conceptId: string, values: string[]): string | null {
    return values.length ? `f_SA_id_${conceptId}:${values.join(",")}` : null;
}

function buildSemanticFilters(config: SearchConfig): string | null {
    const groups: string[] = [];
    const wt = config.workType ? WT_SAL_MAP[config.workType] : undefined;
    const exp = (config.experienceLevel ?? [])
        .filter((e) => e in EXP_SAL_MAP)
        .map((e) => EXP_SAL_MAP[e]);
    const jt = (config.jobType ?? [])
        .filter((j) => j in JT_SAL_MAP)
        .map((j) => JT_SAL_MAP[j]);

    const wtGroup = semanticGroup("225001", wt ? [wt] : []);
    const expGroup = semanticGroup("227001", exp);
    const jtGroup = semanticGroup("226001", jt);

    if (wtGroup) groups.push(wtGroup);
    if (expGroup) groups.push(expGroup);
    if (jtGroup) groups.push(jtGroup);

    return groups.length ? groups.join(",") : null;
}

function buildSearchUrl(config: SearchConfig, start: number): string {
    const wtParts = (config.workType ?? "")
        .split(",")
        .map((w) => w.trim())
        .filter((w) => w in WT_MAP)
        .map((w) => WT_MAP[w]);
    const tpr = config.datePosted ? DATE_MAP[config.datePosted] : undefined;
    const sal = buildSemanticFilters(config);

    const hasFilters =
        config.easyApply ||
        config.under10Applicants ||
        config.inMyNetwork ||
        wtParts.length ||
        sal ||
        tpr;

    const params = new URLSearchParams();
    if (config.keywords) params.set("keywords", config.keywords);
    if (config.geoId) params.set("geoId", config.geoId);
    else if (config.location) params.set("location", config.location);
    if (config.easyApply) params.set("f_AL", "true");
    if (config.under10Applicants) params.set("f_EA", "true");
    if (config.inMyNetwork) params.set("f_JIYN", "true");
    if (sal) params.set("f_SAL", sal);
    if (wtParts.length) params.set("f_WT", wtParts.join(","));
    if (tpr) params.set("f_TPR", tpr);
    if (start) params.set("start", String(start));
    if (hasFilters) params.set("origin", "JOB_SEARCH_PAGE_JOB_FILTER");

    const query = params.toString();
    return "https://www.linkedin.com/jobs/search-results/" + (query ? `?${query}` : "");
}

async function openJobs(page: Page, config: SearchConfig, start: number): Promise<void> {
    const url = buildSearchUrl(config, start);
    console.log(`[jobs] navigating to: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    let finalUrl = page.url();
    console.log(`[jobs] landed on: ${finalUrl}`);
    if (isAuthWall(finalUrl) && await trySavedAccountLogin(page)) {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        finalUrl = page.url();
        console.log(`[jobs] landed after saved account login: ${finalUrl}`);
    }
    if (isAuthWall(finalUrl))
        throw new Error("LinkedIn session expired; log in again");
    await page.waitForTimeout(3000);
}

async function openTopApplicant(page: Page, start: number): Promise<void> {
    const url = "https://www.linkedin.com/jobs/collections/top-applicant/" + (start ? `?start=${start}` : "");
    console.log(`Opening top applicant collection: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    if (isAuthWall(page.url()) && await trySavedAccountLogin(page)) {
        await page.goto(url, { waitUntil: "domcontentloaded" });
    }
    if (isAuthWall(page.url()))
        throw new Error("LinkedIn session expired; log in again");
    await page.waitForTimeout(5000);
}

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

function matchesWorkType(location: string, workType?: string): boolean {
    if (!workType) return true;
    const loc = location.toLowerCase();
    if (workType === "remote") return /remote/.test(loc);
    if (workType === "hybrid") return /hybrid/.test(loc);
    if (workType === "onsite") return !/remote|hybrid/.test(loc);
    return true;
}

function parseCardText(text: string): { title: string; company: string; location: string } {
    const parts = text.split("\n\n");
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

    const href = await applyControl.getAttribute("href").catch(() => null);
    if (href) {
        const match = href.match(/[?&]url=([^&]+)/);
        if (match) return decodeURIComponent(match[1]);
        if (!href.includes("linkedin.com")) return href;
    }

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

const JOB_DETAIL_PANE = "[data-sdui-screen='com.linkedin.sdui.flagshipnav.jobs.SemanticJobDetails']";

export function extractLinkedinJobId(url: string): string | null {
    try {
        const parsed = new URL(url);
        const viewMatch = parsed.pathname.match(/\/jobs\/view\/(\d+)/);
        if (viewMatch) return viewMatch[1];
        const current = parsed.searchParams.get("currentJobId");
        if (current && /^\d+$/.test(current)) return current;
        return null;
    } catch {
        return null;
    }
}

const STANDALONE_JOB_PANE = "[data-sdui-screen='com.linkedin.sdui.flagshipnav.jobs.JobDetails']";

async function readAboutSection(page: Page, aboutContainer: Locator): Promise<string> {
    await aboutContainer.locator("p, li").first().waitFor({ timeout: 10000 }).catch(() => undefined);

    const moreToggle = aboutContainer.getByText(/^…?\s*more$/i).first();
    if (await moreToggle.count()) {
        await moreToggle.scrollIntoViewIfNeeded().catch(() => undefined);
        await moreToggle.click({ timeout: 5000 }).catch(() => undefined);
        await page.waitForTimeout(1000);
    }

    const raw = await aboutContainer.innerText();
    return cleanText(
        raw
            .replace(/^About the job\s*/i, "")
            .replace(/^Sobre a vaga\s*/i, "")
            .replace(/…\s*more\s*$/i, "")
            .trim(),
    );
}

export async function fetchJobByUrl(page: Page, url: string): Promise<Partial<LinkedinJob>> {
    const jobId = extractLinkedinJobId(url);
    if (!jobId) throw new Error(`Could not extract LinkedIn job id from URL: ${url}`);

    const target = `https://www.linkedin.com/jobs/view/${jobId}/`;
    await page.goto(target, { waitUntil: "domcontentloaded" });
    if (isAuthWall(page.url()) && (await trySavedAccountLogin(page))) {
        await page.goto(target, { waitUntil: "domcontentloaded" });
    }
    if (isAuthWall(page.url())) throw new Error("LinkedIn session expired; log in again");
    await page.waitForTimeout(3000);

    const pane = page.locator(STANDALONE_JOB_PANE).first();
    await pane.waitFor({ timeout: 30000 });

    const companyLink = pane.locator("a[href*='/company/']").first();
    const company = (await companyLink.count())
        ? cleanText(await companyLink.innerText()).split("\n")[0]
        : "";

    const lines = (await pane.innerText())
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    const companyIdx = company ? lines.indexOf(company) : -1;
    const title = (companyIdx >= 0 ? lines[companyIdx + 1] : lines[0]) ?? "";
    const metaLine = lines.find((l) => l.includes(" · ")) ?? "";
    const location = metaLine.split(" · ")[0].trim();

    let about: string | null = null;
    const aboutH2 = pane.locator("h2").filter({ hasText: /about the job|sobre a vaga/i }).first();
    if (await aboutH2.count()) {
        about = await readAboutSection(page, aboutH2.locator("xpath=../.."));
    }

    return {
        jobId,
        provider: "linkedin",
        title,
        company,
        location,
        url: target,
        preferences: [],
        skills: [],
        about,
        applicationUrl: null,
    };
}

async function getJobDetails(page: Page, easyApply: boolean, fillSkillGaps: boolean): Promise<Partial<LinkedinJob>> {
    const detailPane = page
        .locator(JOB_DETAIL_PANE)
        .first();

    const aboutH2 = detailPane.locator("h2").filter({ hasText: /about the job|sobre a vaga/i }).first();
    const about = await readAboutSection(page, aboutH2.locator("xpath=../.."));

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
        about,
        applicationUrl,
    };
}

async function* extractJobs(
    page: Page,
    maxJobs?: number,
    fillSkillGaps = false,
    skipJobIds = new Set<string>(),
    onCandidate?: (key: string) => void,
    workType?: string,
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

        if (!matchesWorkType(location, workType)) {
            console.log(`Skipping ${workType} mismatch: ${title} (${location})`);
            continue;
        }

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

    if (config.location && !config.geoId) {
        const geoId = await resolveGeoId(page, config.location);
        if (geoId) {
            config = { ...config, geoId };
            console.log(`[jobs] resolved geoId for "${config.location}": ${geoId}`);
        } else {
            console.log(`[jobs] no geoId for "${config.location}"; falling back to text location`);
        }
    }

    const seenIds = new Set<string>();

    while (true) {
        const seenBefore = seenIds.size;

        if (config.includeTopApplicant) {
            let start = 0;
            while (config.maxJobs == null || seenIds.size < config.maxJobs) {
                await openTopApplicant(page, start);
                if ((yield* fetchPage(page, config, seenIds)) === 0) break;
                start += 25;
            }
        }

        const starts = new Map(keywordsList.map((k) => [k, 0]));
        const exhausted = new Set<string>();

        while (exhausted.size < keywordsList.length) {
            for (const keyword of keywordsList) {
                if (exhausted.has(keyword)) continue;
                if (config.maxJobs != null && seenIds.size >= config.maxJobs) return;

                const start = starts.get(keyword)!;
                await openJobs(page, { ...config, keywords: keyword || undefined }, start);
                if ((yield* fetchPage(page, config, seenIds)) === 0) exhausted.add(keyword);
                else starts.set(keyword, start + 25);
            }
        }

        if (config.maxJobs != null || seenIds.size === seenBefore) break;
    }
}

async function* fetchPage(
    page: Page,
    config: SearchConfig,
    seenIds: Set<string>,
): AsyncGenerator<LinkedinJob, number> {
    const remaining = config.maxJobs != null ? config.maxJobs - seenIds.size : undefined;
    let cards = 0;
    for await (const job of extractJobs(
        page,
        remaining,
        config.fillSkillGaps,
        config.skipJobIds,
        () => cards++,
        config.workType,
    )) {
        if (seenIds.has(job.jobId)) continue;
        seenIds.add(job.jobId);
        yield job;
    }
    return cards;
}

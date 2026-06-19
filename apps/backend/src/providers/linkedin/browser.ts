import { launchContext } from "cloakbrowser";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext } from "playwright-core";

let activeContext: BrowserContext | null = null;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.basename(moduleDir) === "dist" ? path.dirname(moduleDir) : path.resolve(moduleDir, "../../..");
const storageDir = process.env.JOB_APPLIER_STORAGE_DIR ?? path.join(backendRoot, "storage");
export const sessionFilePath = path.join(storageDir, "linkedin-session.json");
const automationSuppressionArgs = ["--disable-blink-features=AutomationControlled", "--disable-infobars"];
const automationSuppressionLaunchOptions = {
    ignoreDefaultArgs: ["--enable-automation"],
};

export type BrowserStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

let saveQueue: Promise<void> = Promise.resolve();

function isLinkedInDomain(value: string): boolean {
    return value.toLowerCase().includes("linkedin.com");
}

function hasLinkedInAuth(state: BrowserStorageState | null): boolean {
    return state?.cookies.some((cookie) => cookie.name === "li_at" && isLinkedInDomain(cookie.domain)) ?? false;
}

function normalizeHost(value: string): string {
    return value.toLowerCase().replace(/^\./, "");
}

function hostMatches(host: string, candidates: Iterable<string>): boolean {
    const normalizedHost = normalizeHost(host);
    for (const candidate of candidates) {
        const normalizedCandidate = normalizeHost(candidate);
        if (!normalizedCandidate) continue;
        if (normalizedHost === normalizedCandidate) return true;
        if (normalizedHost.endsWith(`.${normalizedCandidate}`)) return true;
        if (normalizedCandidate.endsWith(`.${normalizedHost}`)) return true;
    }
    return false;
}

function originHost(origin: string): string | null {
    try {
        return new URL(origin).hostname;
    } catch {
        return null;
    }
}

async function readExistingState(): Promise<BrowserStorageState | null> {
    try {
        return JSON.parse(await fs.readFile(sessionFilePath, "utf8")) as BrowserStorageState;
    } catch {
        return null;
    }
}

function cookieKey(cookie: BrowserStorageState["cookies"][number]): string {
    return `${cookie.name}\n${cookie.domain}\n${cookie.path}`;
}

function mergeLinkedInState(existing: BrowserStorageState | null, current: BrowserStorageState): BrowserStorageState {
    const nonLinkedInCookies = existing?.cookies.filter((cookie) => !isLinkedInDomain(cookie.domain)) ?? [];
    const linkedinCookies = current.cookies.filter((cookie) => isLinkedInDomain(cookie.domain));
    const cookies = new Map<string, BrowserStorageState["cookies"][number]>();
    for (const cookie of nonLinkedInCookies) cookies.set(cookieKey(cookie), cookie);
    for (const cookie of linkedinCookies) cookies.set(cookieKey(cookie), cookie);

    const nonLinkedInOrigins = existing?.origins.filter((origin) => !isLinkedInDomain(origin.origin)) ?? [];
    const linkedinOrigins = current.origins.filter((origin) => isLinkedInDomain(origin.origin));
    const origins = new Map<string, BrowserStorageState["origins"][number]>();
    for (const origin of nonLinkedInOrigins) origins.set(origin.origin, origin);
    for (const origin of linkedinOrigins) origins.set(origin.origin, origin);

    return { cookies: [...cookies.values()], origins: [...origins.values()] };
}

function mergeScopedState(
    existing: BrowserStorageState | null,
    current: BrowserStorageState,
    hosts: Iterable<string>,
): BrowserStorageState {
    const preserveLinkedInAuth = hasLinkedInAuth(existing) && !hasLinkedInAuth(current);
    const hostList = [...hosts]
        .map(normalizeHost)
        .filter((host) => host && !(preserveLinkedInAuth && isLinkedInDomain(host)));
    if (hostList.length === 0) return existing ?? { cookies: [], origins: [] };

    const preservedCookies = existing?.cookies.filter((cookie) => !hostMatches(cookie.domain, hostList)) ?? [];
    const scopedCookies = current.cookies.filter((cookie) => hostMatches(cookie.domain, hostList));
    const cookies = new Map<string, BrowserStorageState["cookies"][number]>();
    for (const cookie of preservedCookies) cookies.set(cookieKey(cookie), cookie);
    for (const cookie of scopedCookies) cookies.set(cookieKey(cookie), cookie);

    const preservedOrigins = existing?.origins.filter((origin) => {
        const host = originHost(origin.origin);
        return !host || !hostMatches(host, hostList);
    }) ?? [];
    const scopedOrigins = current.origins.filter((origin) => {
        const host = originHost(origin.origin);
        return host ? hostMatches(host, hostList) : false;
    });
    const origins = new Map<string, BrowserStorageState["origins"][number]>();
    for (const origin of preservedOrigins) origins.set(origin.origin, origin);
    for (const origin of scopedOrigins) origins.set(origin.origin, origin);

    return { cookies: [...cookies.values()], origins: [...origins.values()] };
}

function writeQueued(fn: () => Promise<void>): Promise<void> {
    saveQueue = saveQueue.then(fn, fn);
    return saveQueue;
}

export async function saveSharedBrowserState(current: BrowserStorageState, hosts: Iterable<string>): Promise<void> {
    await writeQueued(async () => {
        await fs.mkdir(storageDir, { recursive: true });
        await fs.writeFile(sessionFilePath, JSON.stringify(mergeScopedState(await readExistingState(), current, hosts)), "utf-8");
    });
}

async function existingSessionFile(): Promise<string | undefined> {
    try {
        await fs.access(sessionFilePath);
        return sessionFilePath;
    } catch {
        return undefined;
    }
}

export async function openLinkedinContext(options: {
    visible: boolean;
    searchLocale?: "pt-BR" | "en-US";
    display?: string;
}): Promise<BrowserContext> {
    if (activeContext) {
        throw new Error("LinkedIn browser is already running. Wait for the current action to finish.");
    }

    const locale = options.searchLocale ?? "pt-BR";
    const acceptLanguage =
        locale === "pt-BR"
            ? "pt-BR,pt;q=0.9,en-US;q=0.7,en;q=0.6"
            : "en-US,en;q=0.9";

    const prev = process.env.DISPLAY;
    if (options.display) process.env.DISPLAY = options.display;
    try {
        const width = options.visible ? 1272 : 960;
        const height = options.visible ? 715 : 640;
        const context = await launchContext({
            headless: !options.visible,
            locale,
            viewport: { width, height },
            launchOptions: automationSuppressionLaunchOptions,
            args: [`--window-size=${width},${height}`, "--window-position=0,0", ...automationSuppressionArgs],
            contextOptions: {
                storageState: await existingSessionFile(),
                extraHTTPHeaders: { "Accept-Language": acceptLanguage },
            },
            humanize: true,
        });
        context.setDefaultTimeout(10 * 60 * 1000);
        activeContext = context;
        context.once("close", () => {
            if (activeContext === context) activeContext = null;
        });
        return context;
    } finally {
        if (prev !== undefined) process.env.DISPLAY = prev;
        else delete process.env.DISPLAY;
    }
}

export async function openDetachedLinkedinContext(options: {
    visible?: boolean;
    searchLocale?: "pt-BR" | "en-US";
} = {}): Promise<BrowserContext> {
    const locale = options.searchLocale ?? "pt-BR";
    const acceptLanguage =
        locale === "pt-BR"
            ? "pt-BR,pt;q=0.9,en-US;q=0.7,en;q=0.6"
            : "en-US,en;q=0.9";

    const context = await launchContext({
        headless: !options.visible,
        locale,
        viewport: { width: 960, height: 640 },
        launchOptions: { slowMo: 50, ...automationSuppressionLaunchOptions },
        args: ["--window-size=960,640", ...automationSuppressionArgs],
        contextOptions: {
            storageState: await existingSessionFile(),
            extraHTTPHeaders: { "Accept-Language": acceptLanguage },
        },
        humanize: true,
    });
    context.setDefaultTimeout(10 * 60 * 1000);
    return context;
}

export async function saveLinkedinSession(context = activeContext): Promise<void> {
    if (!context) return;
    const state = await context.storageState();
    await writeQueued(async () => {
        await fs.mkdir(storageDir, { recursive: true });
        await fs.writeFile(sessionFilePath, JSON.stringify(mergeLinkedInState(await readExistingState(), state)), "utf-8");
    });
}

export async function closeLinkedinContext(context = activeContext): Promise<void> {
    if (!context) return;
    await context.close().catch(() => undefined);
    if (activeContext === context) activeContext = null;
}

export async function openLoginContext(): Promise<BrowserContext> {
    if (activeContext) {
        throw new Error("LinkedIn browser is already running. Wait for the current action to finish.");
    }
    const width = 1272;
    const height = 715;
    const context = await launchContext({
        headless: false,
        locale: "pt-BR",
        viewport: { width, height },
        launchOptions: { slowMo: 50, ...automationSuppressionLaunchOptions },
        args: [`--window-size=${width},${height}`, "--window-position=0,0", ...automationSuppressionArgs],
        contextOptions: {
            storageState: await existingSessionFile(),
            extraHTTPHeaders: { "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.7,en;q=0.6" },
        },
        humanize: true,
        humanPreset: "careful",
    });
    context.setDefaultTimeout(10 * 60 * 1000);
    activeContext = context;
    context.once("close", () => {
        if (activeContext === context) activeContext = null;
    });
    try {
        const page = context.pages()[0] ?? await context.newPage();
        await page.goto("https://www.linkedin.com/", { waitUntil: "domcontentloaded" }).catch(() => undefined);
        return context;
    } catch (e) {
        await closeLinkedinContext(context);
        throw e;
    }
}

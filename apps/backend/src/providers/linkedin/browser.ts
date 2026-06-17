import { launchContext } from "cloakbrowser";
import fs from "node:fs/promises";
import path from "node:path";
import type { BrowserContext } from "playwright-core";

let activeContext: BrowserContext | null = null;

const storageDir = path.resolve("storage");
export const sessionFilePath = path.join(storageDir, "linkedin-session.json");

type BrowserStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

function isLinkedInDomain(value: string): boolean {
    return value.toLowerCase().includes("linkedin.com");
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
}): Promise<BrowserContext> {
    if (activeContext) {
        throw new Error("LinkedIn browser is already running. Wait for the current action to finish.");
    }

    const locale = options.searchLocale ?? "pt-BR";
    const acceptLanguage =
        locale === "pt-BR"
            ? "pt-BR,pt;q=0.9,en-US;q=0.7,en;q=0.6"
            : "en-US,en;q=0.9";

    const context = await launchContext({
        headless: !options.visible,
        locale,
        viewport: { width: 960, height: 640 },
        launchOptions: { slowMo: 50 },
        args: ["--window-size=960,640"],
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
        launchOptions: { slowMo: 50 },
        args: ["--window-size=960,640"],
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
    await fs.mkdir(storageDir, { recursive: true });

    const state = await context.storageState();
    await fs.writeFile(sessionFilePath, JSON.stringify(mergeLinkedInState(await readExistingState(), state)), "utf-8");
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
        launchOptions: { slowMo: 50 },
        args: [`--window-size=${width},${height}`, "--window-position=0,0"],
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

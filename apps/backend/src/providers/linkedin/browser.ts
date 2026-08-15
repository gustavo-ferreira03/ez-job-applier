import { launchContext } from "cloakbrowser";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext } from "playwright-core";

let activeContext: BrowserContext | null = null;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.basename(moduleDir) === "dist" ? path.dirname(moduleDir) : path.resolve(moduleDir, "../../..");
const storageDir = process.env.JOB_APPLIER_STORAGE_DIR ?? path.join(backendRoot, "storage");
export const sessionFilePath = path.join(storageDir, "linkedin-session.json");
const fingerprintFilePath = path.join(storageDir, "browser-fingerprint.json");
const automationSuppressionArgs = ["--disable-blink-features=AutomationControlled", "--disable-infobars"];
const automationSuppressionLaunchOptions = {
    ignoreDefaultArgs: ["--enable-automation"],
};

/**
 * Chromium picks its X display from the DISPLAY env var. That variable is process-global, so
 * mutating it around a launch is a race as soon as two browsers are being opened: one caller
 * restores an older value while another is still launching, and the browser attaches to an Xvfb
 * that is about to be killed. Pass the display in the child's own environment instead.
 */
function displayEnv(display: string | undefined): { env?: NodeJS.ProcessEnv } {
    return display ? { env: { ...process.env, DISPLAY: display } } : {};
}

export type BrowserStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

/**
 * cloakbrowser randomises `--fingerprint=<seed>` on every launch, so each browser looks like a
 * brand new device. LinkedIn reacts to unknown devices by forcing a password re-entry (most
 * visibly on the "Sign in with LinkedIn" OAuth screen used by external ATS sites). Pinning one
 * seed per installation keeps the device identity stable across launches and processes.
 */
let cachedFingerprintSeed: number | null = null;
let fingerprintPromise: Promise<string[]> | null = null;

async function loadFingerprintSeed(): Promise<number> {
    if (cachedFingerprintSeed !== null) return cachedFingerprintSeed;
    try {
        const parsed = JSON.parse(await fs.readFile(fingerprintFilePath, "utf8")) as { seed?: number };
        if (typeof parsed.seed === "number" && Number.isFinite(parsed.seed)) {
            cachedFingerprintSeed = parsed.seed;
            return parsed.seed;
        }
    } catch {
        // no seed yet
    }
    const seed = Math.floor(Math.random() * 90000) + 10000;
    cachedFingerprintSeed = seed;
    await fs.mkdir(storageDir, { recursive: true }).catch(() => undefined);
    await fs.writeFile(fingerprintFilePath, JSON.stringify({ seed }), "utf8").catch(() => undefined);
    return seed;
}

/** Chromium args that pin the stealth fingerprint to this installation's stable seed. */
export function stableFingerprintArgs(): Promise<string[]> {
    fingerprintPromise ??= loadFingerprintSeed().then((seed) => [`--fingerprint=${seed}`]);
    return fingerprintPromise;
}

let saveQueue: Promise<void> = Promise.resolve();

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

/** Expired persistent cookie. Session cookies use expires <= 0 and never expire on disk. */
function isExpiredCookie(cookie: BrowserStorageState["cookies"][number], nowSec: number): boolean {
    return cookie.expires > 0 && cookie.expires < nowSec;
}

/**
 * Merge every cookie/origin from `current` over `existing`, keeping unrelated existing entries.
 * Expired cookies are dropped so the shared session file doesn't grow without bound as the agent
 * visits more ATS sites.
 */
export function mergeAllState(
    existing: BrowserStorageState | null,
    current: BrowserStorageState,
): BrowserStorageState {
    const nowSec = Date.now() / 1000;
    // Prune per input, never after merging: a stale expired entry in `current` must not displace
    // the live cookie of the same name in `existing` and then be dropped, which would delete the
    // credential entirely. Observed killing live li_at-adjacent LinkedIn cookies (lidc, __cf_bm).
    const live = (cookie: BrowserStorageState["cookies"][number]) => !isExpiredCookie(cookie, nowSec);
    const cookies = new Map<string, BrowserStorageState["cookies"][number]>();
    for (const cookie of (existing?.cookies ?? []).filter(live)) cookies.set(cookieKey(cookie), cookie);
    for (const cookie of current.cookies.filter(live)) cookies.set(cookieKey(cookie), cookie);

    const origins = new Map<string, BrowserStorageState["origins"][number]>();
    for (const origin of existing?.origins ?? []) origins.set(origin.origin, origin);
    for (const origin of current.origins) origins.set(origin.origin, origin);

    return { cookies: [...cookies.values()], origins: [...origins.values()] };
}

/** The shared session state (LinkedIn + every ATS login the agent has accumulated). */
export function readSharedSessionState(): Promise<BrowserStorageState | null> {
    return readExistingState();
}

function writeQueued(fn: () => Promise<void>): Promise<void> {
    saveQueue = saveQueue.then(fn, fn);
    return saveQueue;
}

async function writeStorageState(state: BrowserStorageState): Promise<void> {
    await fs.mkdir(storageDir, { recursive: true });
    const tempPath = path.join(storageDir, `.linkedin-session-${process.pid}-${randomUUID()}.tmp`);
    try {
        await fs.writeFile(tempPath, JSON.stringify(state), "utf-8");
        await fs.rename(tempPath, sessionFilePath);
    } catch (e) {
        await fs.rm(tempPath, { force: true }).catch(() => undefined);
        throw e;
    }
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

    const width = options.visible ? 1272 : 960;
    const height = options.visible ? 715 : 640;
    const context = await launchContext({
        headless: !options.visible,
        locale,
        viewport: { width, height },
        launchOptions: { ...automationSuppressionLaunchOptions, ...displayEnv(options.display) },
        args: [`--window-size=${width},${height}`, "--window-position=0,0", ...automationSuppressionArgs, ...(await stableFingerprintArgs())],
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
    display?: string;
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
        launchOptions: { slowMo: 50, ...automationSuppressionLaunchOptions, ...displayEnv(options.display) },
        args: ["--window-size=960,640", ...automationSuppressionArgs, ...(await stableFingerprintArgs())],
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
        await writeStorageState(mergeLinkedInState(await readExistingState(), state));
    });
}

/**
 * Fold a storage state captured outside the LinkedIn provider (e.g. the external-apply browser)
 * back into the shared session file, so LinkedIn "remember this device" cookies and ATS logins
 * survive into the next job instead of dying with the per-job state file.
 */
export async function mergeExternalSession(state: BrowserStorageState): Promise<void> {
    await writeQueued(async () => {
        await writeStorageState(mergeAllState(await readExistingState(), state));
    });
}

export async function closeLinkedinContext(context = activeContext): Promise<void> {
    if (!context) return;
    await context.close().catch(() => undefined);
    if (activeContext === context) activeContext = null;
}

export async function openLoginContext(options: { display?: string } = {}): Promise<BrowserContext> {
    if (activeContext) {
        throw new Error("LinkedIn browser is already running. Wait for the current action to finish.");
    }
    const width = 1272;
    const height = 715;
    const context = await launchContext({
        headless: false,
        locale: "pt-BR",
        viewport: { width, height },
        launchOptions: { slowMo: 50, ...automationSuppressionLaunchOptions, ...displayEnv(options.display) },
        args: [`--window-size=${width},${height}`, "--window-position=0,0", ...automationSuppressionArgs, ...(await stableFingerprintArgs())],
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

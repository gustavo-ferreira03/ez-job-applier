import type { Page } from "playwright-core";
import { setLanguageEnglish } from "./setLanguageEnglish";
import { hasLinkedInSession, isLoggedIn } from "./status";

const SAVED_ACCOUNT_RE = /sign in as|entrar como|continue as|continuar como/i;

function isGuestLoginUrl(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes("/login") || lower.includes("/uas/login") || lower.includes("checkpoint") || lower.includes("/hp");
}

async function waitForSession(page: Page, timeoutMs = 20000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const ok = await hasLinkedInSession(page.context(), page).catch(() => false);
        if (ok && !isGuestLoginUrl(page.url())) return true;
        await page.waitForTimeout(500);
    }
    return false;
}

async function clickSavedAccount(page: Page): Promise<boolean> {
    const account = page.locator("button, a, [role='button']").filter({ hasText: SAVED_ACCOUNT_RE }).first();
    if (!(await account.count().catch(() => 0))) return false;
    console.log("[login] trying saved account login");
    await account.click({ timeout: 5000 }).catch(() => undefined);
    return waitForSession(page);
}

export async function trySavedAccountLogin(page: Page): Promise<boolean> {
    if (await clickSavedAccount(page)) return true;

    await page.goto("https://www.linkedin.com/", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
    }).catch(() => undefined);
    await page.waitForTimeout(1500);

    return clickSavedAccount(page);
}

export async function login(page: Page) {
    if (await isLoggedIn(page)) {
        await setLanguageEnglish(page);
        return;
    }

    if (await trySavedAccountLogin(page) && await isLoggedIn(page)) {
        await setLanguageEnglish(page);
        return;
    }

    throw new Error("LinkedIn session expired; log in again");
}

import type { Page } from "playwright-core";

export async function isLoggedIn(page: Page): Promise<boolean> {
    await page.goto("https://www.linkedin.com/feed/", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
    });

    try {
        await page.waitForURL("**/feed/**", { timeout: 10000 });
        return true;
    } catch {
        return false;
    }
}

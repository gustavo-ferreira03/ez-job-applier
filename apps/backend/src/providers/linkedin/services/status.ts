import type { Page } from "playwright-core";

function isAuthWall(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes("/login") || lower.includes("/uas/login") || lower.includes("checkpoint");
}

export async function isLoggedIn(page: Page): Promise<boolean> {
    await page.goto("https://www.linkedin.com/feed/", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
    });

    try {
        await page.waitForFunction(
            () =>
                window.location.href.includes("/login") ||
                window.location.href.includes("checkpoint") ||
                window.location.href.includes("/feed"),
            { timeout: 10000, polling: 500 },
        );
    } catch {
        return false;
    }

    return !isAuthWall(page.url()) && page.url().includes("/feed");
}

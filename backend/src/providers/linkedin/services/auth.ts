import type { Page } from "playwright-core";
import { setLanguageEnglish } from "./setLanguageEnglish";

export async function login(page: Page) {
    await page.goto("https://www.linkedin.com/feed/", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
    });

    // Wait for URL to stabilize: LinkedIn may redirect to /login via client-side JS
    // even though domcontentloaded already fired with /feed/ in the URL.
    try {
        await page.waitForURL("**/feed/**", { timeout: 10000 });
        return; // Already logged in
    } catch {
        // Not on feed — need to log in
    }

    await page.goto("https://www.linkedin.com/login", {
        waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(
        () =>
            !window.location.href.includes("/login") &&
            !window.location.href.includes("checkpoint"),
        { timeout: 120_000, polling: 1000 },
    );

    await setLanguageEnglish(page);
}

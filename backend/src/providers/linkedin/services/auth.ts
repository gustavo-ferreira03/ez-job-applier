import type { Page } from "playwright-core";
import { setLanguageEnglish } from "./setLanguageEnglish";
import { isLoggedIn } from "./status";

const MANUAL_LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

export async function login(page: Page) {
    if (await isLoggedIn(page)) {
        await setLanguageEnglish(page);
        return;
    }

    await page.goto("https://www.linkedin.com/login", {
        waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(
        () =>
            !window.location.href.includes("/login") &&
            !window.location.href.includes("/uas/login") &&
            !window.location.href.includes("checkpoint"),
        { timeout: MANUAL_LOGIN_TIMEOUT_MS, polling: 1000 },
    );

    await setLanguageEnglish(page);
}

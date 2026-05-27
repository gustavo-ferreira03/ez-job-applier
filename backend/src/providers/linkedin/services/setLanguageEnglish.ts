import type { Page } from "playwright-core";

export async function setLanguageEnglish(page: Page) {
    await page.goto("https://www.linkedin.com/mypreferences/d/language", {
        waitUntil: "domcontentloaded",
    });

    const url = page.url();
    if (
        url.includes("/login") ||
        url.includes("checkpoint") ||
        !url.includes("mypreferences")
    ) {
        throw new Error(
            "LinkedIn login did not produce an authenticated session",
        );
    }

    const select = page.locator("select").first();
    await select.waitFor({ timeout: 10000 });

    const current = await select.inputValue();
    if (current !== "en_US") {
        await Promise.all([
            page.waitForResponse(
                (r) =>
                    r.url().includes("interfaceLocale") &&
                    r.request().method() === "PUT",
                { timeout: 10000 },
            ),
            select.selectOption("en_US"),
        ]);
    }
}

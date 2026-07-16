import { launchContext } from "cloakbrowser";
import type { BrowserContext } from "playwright-core";

export interface PageText {
    text: string;
    title: string;
}

export async function fetchPageText(url: string): Promise<PageText | null> {
    let context: BrowserContext | null = null;
    try {
        context = await launchContext({
            headless: true,
            locale: "pt-BR",
            viewport: { width: 1280, height: 900 },
            launchOptions: { ignoreDefaultArgs: ["--enable-automation"] },
            args: ["--disable-blink-features=AutomationControlled", "--disable-infobars"],
            contextOptions: { extraHTTPHeaders: { "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.7,en;q=0.6" } },
            humanize: true,
        });
        context.setDefaultTimeout(45_000);
        const page = await context.newPage();
        const response = await page.goto(url, { waitUntil: "domcontentloaded" });
        if (!response || response.status() >= 400) return null;
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        const text = (await page.locator("body").innerText()).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
        const title = await page.title();
        return { text, title };
    } catch (e) {
        console.error(`[fetch-page-text] failed for ${url}:`, e);
        return null;
    } finally {
        await context?.close().catch(() => {});
    }
}

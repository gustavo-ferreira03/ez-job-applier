import { launchPersistentContext } from "cloakbrowser";
import type { BrowserContext } from "playwright-core";

let context: BrowserContext | null = null;

export async function getContext(): Promise<BrowserContext> {
    if (!context) {
        context = await launchPersistentContext({
            userDataDir: "./chrome-profile",
            headless: false,
            viewport: { width: 1280, height: 720 },
        });
    }
    return context;
}

export async function closeContext(): Promise<void> {
    if (context) {
        await context.close();
        context = null;
    }
}

import { launchPersistentContext } from "cloakbrowser";
import type { BrowserContext } from "playwright-core";

let context: BrowserContext | null = null;

export async function getContext(): Promise<BrowserContext> {
    if (!context) {
        context = await launchPersistentContext({
            userDataDir: "./chrome-profile",
            headless: false,
            viewport: { width: 1280, height: 720 },
            // On Linux/WSL the OS keyring is unavailable, so Chromium can't decrypt
            // cookies it wrote in a previous session. --password-store=basic stores
            // them unencrypted so the session survives browser restarts.
            args: ["--password-store=basic"],
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

import { launchPersistentContext } from "cloakbrowser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext } from "playwright-core";

let activeContext: BrowserContext | null = null;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot =
    path.basename(path.dirname(moduleDir)) === "dist"
        ? path.resolve(moduleDir, "..", "..")
        : path.resolve(moduleDir, "..");
const chromeProfileDir = path.join(backendRoot, "chrome-profile");

export async function openContext(options: {
    visible: boolean;
}): Promise<BrowserContext> {
    if (activeContext) {
        throw new Error("Browser is already running. Wait for the current action to finish.");
    }

    try {
        const context = await launchPersistentContext({
            userDataDir: chromeProfileDir,
            headless: !options.visible,
            viewport: { width: 960, height: 640 },
            args: [
                "--password-store=basic",
                "--window-size=960,640",
                "--hide-crash-restore-bubble",
                "--disable-session-crashed-bubble",
            ],
        });
        activeContext = context;
        context.once("close", () => {
            if (activeContext === context) activeContext = null;
        });
        return context;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
            message.includes("ProcessSingleton") ||
            message.includes("already in use") ||
            message.includes("profile directory")
        ) {
            throw new Error(
                `Chrome profile is already in use: ${chromeProfileDir}. Close other Chromium/Playwright instances using this profile before starting LinkedIn automation.`,
            );
        }
        throw error;
    }
}

export async function closeContext(context = activeContext): Promise<void> {
    if (!context) return;
    await context.close().catch(() => undefined);
    if (activeContext === context) activeContext = null;
}

import { launchPersistentContext } from "cloakbrowser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext } from "playwright-core";

let context: BrowserContext | null = null;
let contextPromise: Promise<BrowserContext> | null = null;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot =
    path.basename(path.dirname(moduleDir)) === "dist"
        ? path.resolve(moduleDir, "..", "..")
        : path.resolve(moduleDir, "..");
const chromeProfileDir = path.join(backendRoot, "chrome-profile");

export function isContextOpen(): boolean {
    return context !== null;
}

export function getChromeProfileDir(): string {
    return chromeProfileDir;
}

export async function getContext(): Promise<BrowserContext> {
    if (context) return context;

    contextPromise ??= launchPersistentContext({
        userDataDir: chromeProfileDir,
        headless: false,
        viewport: { width: 1280, height: 720 },
        // On Linux/WSL the OS keyring is unavailable, so Chromium can't decrypt
        // cookies it wrote in a previous session. --password-store=basic stores
        // them unencrypted so the session survives browser restarts.
        args: ["--password-store=basic"],
    })
        .then((launchedContext) => {
            context = launchedContext;
            return launchedContext;
        })
        .catch((error: unknown) => {
            contextPromise = null;
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
        });

    return await contextPromise;
}

export async function closeContext(): Promise<void> {
    if (context) {
        await context.close();
        context = null;
        contextPromise = null;
    }
}

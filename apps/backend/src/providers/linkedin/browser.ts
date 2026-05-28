import { launchContext } from "cloakbrowser";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext } from "playwright-core";

let activeContext: BrowserContext | null = null;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = moduleDir.includes(`${path.sep}dist${path.sep}`)
    ? path.resolve(moduleDir, "..", "..", "..")
    : path.resolve(moduleDir, "..", "..", "..");
const storageDir = path.join(backendRoot, "storage");
const sessionFilePath = path.join(storageDir, "linkedin-session.json");

async function existingSessionFile(): Promise<string | undefined> {
    try {
        await fs.access(sessionFilePath);
        return sessionFilePath;
    } catch {
        return undefined;
    }
}

export async function openLinkedinContext(options: {
    visible: boolean;
}): Promise<BrowserContext> {
    if (activeContext) {
        throw new Error("LinkedIn browser is already running. Wait for the current action to finish.");
    }

    const context = await launchContext({
        headless: !options.visible,
        locale: "en-US",
        viewport: { width: 960, height: 640 },
        launchOptions: { slowMo: 50 },
        args: ["--window-size=960,640"],
        contextOptions: {
            storageState: await existingSessionFile(),
            extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
        },
    });
    context.setDefaultTimeout(10 * 60 * 1000);
    activeContext = context;
    context.once("close", () => {
        if (activeContext === context) activeContext = null;
    });
    return context;
}

export async function saveLinkedinSession(context = activeContext): Promise<void> {
    if (!context) return;
    await fs.mkdir(storageDir, { recursive: true });

    const state = await context.storageState();
    state.cookies = state.cookies.filter((cookie) =>
        cookie.domain.toLowerCase().includes("linkedin.com"),
    );
    state.origins = state.origins.filter((origin) =>
        origin.origin.toLowerCase().includes("linkedin.com"),
    );

    await fs.writeFile(sessionFilePath, JSON.stringify(state), "utf-8");
}

export async function closeLinkedinContext(context = activeContext): Promise<void> {
    if (!context) return;
    await context.close().catch(() => undefined);
    if (activeContext === context) activeContext = null;
}

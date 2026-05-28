import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface AppSettings {
    browserVisible: boolean;
    searchLocale: "pt-BR" | "en-US";
}

const defaults: AppSettings = { browserVisible: false, searchLocale: "pt-BR" };

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(moduleDir, "..", "..");
const settingsPath = path.join(backendRoot, "storage", "settings.json");

export async function getSettings(): Promise<AppSettings> {
    try {
        const raw = await fs.readFile(settingsPath, "utf-8");
        return { ...defaults, ...(JSON.parse(raw) as Partial<AppSettings>) };
    } catch {
        return { ...defaults };
    }
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const current = await getSettings();
    const updated = { ...current, ...patch };
    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(settingsPath, JSON.stringify(updated, null, 2), "utf-8");
    return updated;
}

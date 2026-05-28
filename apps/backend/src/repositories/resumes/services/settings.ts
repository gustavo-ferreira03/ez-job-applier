import fs from "node:fs/promises";
import path from "node:path";

const SETTINGS_FILE = path.resolve("storage/settings.json");

export interface Settings {
    default_resume?: string | null;
}

export async function readSettings(): Promise<Settings> {
    try {
        return JSON.parse(await fs.readFile(SETTINGS_FILE, "utf-8"));
    } catch {
        return {};
    }
}

export async function writeSettings(patch: Partial<Settings>): Promise<void> {
    const current = await readSettings();
    await fs.writeFile(
        SETTINGS_FILE,
        JSON.stringify({ ...current, ...patch }, null, 2),
        "utf-8",
    );
}

export async function getDefaultResume(): Promise<string | null> {
    return (await readSettings()).default_resume ?? null;
}

export async function setDefaultResume(filename: string | null): Promise<void> {
    await writeSettings({ default_resume: filename });
}

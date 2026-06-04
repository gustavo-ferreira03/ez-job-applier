import { getSettings, updateSettings } from "../../settings";

export interface Settings {
    default_resume?: string | null;
}

export async function readSettings(): Promise<Settings> {
    const settings = await getSettings();
    return { default_resume: settings.general.defaultResume };
}

export async function writeSettings(patch: Partial<Settings>): Promise<void> {
    if ("default_resume" in patch) {
        await updateSettings({ general: { defaultResume: patch.default_resume ?? null } });
    }
}

export async function getDefaultResume(): Promise<string | null> {
    return (await readSettings()).default_resume ?? null;
}

export async function setDefaultResume(filename: string | null): Promise<void> {
    await writeSettings({ default_resume: filename });
}

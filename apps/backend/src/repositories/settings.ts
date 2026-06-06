import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { appSettings } from "../db/schema";
import type { DiscoverConfig } from "../core/types";

export interface LlmSettings {
    enabled: boolean;
    provider: string;
    model: string;
    filterJobs: boolean;
    autoAnswer: boolean;
    externalApply: boolean;
    filterCriteria: string;
}

export interface AppSettings {
    general: GeneralSettings;
    llm: LlmSettings;
    advanced: AdvancedSettings;
}

export interface ScheduleDay {
    enabled: boolean;
    start: string;
    end: string;
}

export interface ScheduleSettings {
    enabled: boolean;
    timezone: string;
    days: ScheduleDay[];
}

export interface GeneralSettings {
    execution: DiscoverConfig;
    defaultResume: string | null;
    blockedKeywords: string[];
    blockedCompanies: string[];
}

export interface AdvancedSettings {
    browserVisible: boolean;
    searchLocale: "pt-BR" | "en-US";
    cycleMaxMs: number;
    intervalMs: number;
    schedule: ScheduleSettings;
}

const defaults: AppSettings = {
    general: {
        execution: { provider: "linkedin", options: { easyApply: true } },
        defaultResume: null,
        blockedKeywords: [],
        blockedCompanies: [],
    },
    llm: { enabled: false, provider: "anthropic", model: "claude-sonnet-4-6", filterJobs: false, autoAnswer: false, externalApply: false, filterCriteria: "" },
    advanced: {
        browserVisible: false,
        searchLocale: "pt-BR",
        cycleMaxMs: 3_600_000,
        intervalMs: 14_400_000,
        schedule: {
            enabled: false,
            timezone: "America/Sao_Paulo",
            days: [
                { enabled: true, start: "09:00", end: "18:00" },
                { enabled: true, start: "09:00", end: "18:00" },
                { enabled: true, start: "09:00", end: "18:00" },
                { enabled: true, start: "09:00", end: "18:00" },
                { enabled: true, start: "09:00", end: "18:00" },
                { enabled: false, start: "09:00", end: "18:00" },
                { enabled: false, start: "09:00", end: "18:00" },
            ],
        },
    },
};

type SettingsPatch = Partial<{
    general: Partial<GeneralSettings> & { execution?: Partial<DiscoverConfig> };
    llm: Partial<LlmSettings>;
    advanced: Partial<AdvancedSettings>;
}>;

const SETTINGS_ID = 1;

function parseGroup<T>(value: string, fallback: T): Partial<T> {
    try {
        return JSON.parse(value) as Partial<T>;
    } catch {
        return fallback;
    }
}

function mergeSettings(current: AppSettings, patch: SettingsPatch): AppSettings {
    const execution = patch.general?.execution
        ? {
            ...current.general.execution,
            ...patch.general.execution,
            options: {
                ...(current.general.execution.options ?? {}),
                ...(patch.general.execution.options ?? {}),
            },
        }
        : current.general.execution;

    return {
        general: { ...current.general, ...patch.general, execution },
        llm: { ...current.llm, ...patch.llm },
        advanced: { ...current.advanced, ...patch.advanced },
    };
}

export async function getSettings(): Promise<AppSettings> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.id, SETTINGS_ID)).limit(1);
    if (!row) return structuredClone(defaults);

    const general = parseGroup<GeneralSettings>(row.general, defaults.general);
    const llm = parseGroup<LlmSettings>(row.llm, defaults.llm);
    const advanced = parseGroup<AdvancedSettings>(row.advanced, defaults.advanced);

    return mergeSettings(defaults, { general, llm, advanced });
}

export async function updateSettings(patch: SettingsPatch): Promise<AppSettings> {
    const current = await getSettings();
    const updated = mergeSettings(current, patch);
    const values = {
        id: SETTINGS_ID,
        general: JSON.stringify(updated.general),
        llm: JSON.stringify(updated.llm),
        advanced: JSON.stringify(updated.advanced),
        updatedAt: new Date().toISOString(),
    };

    await db
        .insert(appSettings)
        .values(values)
        .onConflictDoUpdate({
            target: appSettings.id,
            set: {
                general: values.general,
                llm: values.llm,
                advanced: values.advanced,
                updatedAt: values.updatedAt,
            },
        });

    return updated;
}

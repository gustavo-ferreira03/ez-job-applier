import path from "node:path";
import fs from "node:fs/promises";
import { PDFParse } from "pdf-parse";
import type { IResumeRepo } from "../core/ports";

const SETTINGS_FILE = path.resolve("storage/settings.json");
export const RESUMES_DIR = path.resolve("storage/resumes");

export class ResumeRepository implements IResumeRepo {
    async getDefaultResumePath(): Promise<string | undefined> {
        try {
            const raw = await fs.readFile(SETTINGS_FILE, "utf-8");
            const settings = JSON.parse(raw) as { default_resume?: string | null };
            const filename = settings.default_resume;
            return filename ? path.join(RESUMES_DIR, filename) : undefined;
        } catch {
            return undefined;
        }
    }

    async getDefaultResumeText(): Promise<string | undefined> {
        const filePath = await this.getDefaultResumePath();
        if (!filePath) return undefined;
        const buffer = await fs.readFile(filePath);
        const result = await new PDFParse({ data: buffer }).getText();
        return result.text;
    }

    async getResumePath(filename: string): Promise<string> {
        return path.join(RESUMES_DIR, filename);
    }
}

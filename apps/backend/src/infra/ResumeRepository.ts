import path from "node:path";
import fs from "node:fs/promises";
import { PDFParse } from "pdf-parse";
import type { IResumeRepo } from "../core/ports";
import { getSettings } from "../repositories/settings";

export const RESUMES_DIR = path.resolve("storage/resumes");

export class ResumeRepository implements IResumeRepo {
    async getDefaultResumePath(): Promise<string | undefined> {
        const settings = await getSettings();
        return settings.general.defaultResume ? path.join(RESUMES_DIR, settings.general.defaultResume) : undefined;
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

import path from "node:path";
import fs from "node:fs/promises";
import { parse, stringify } from "yaml";
import type { ResumeInput } from "resume-ci";
import type { IResumeMasterRepo, TailoredResumeMeta } from "../core/ports";

export const RESUME_DIR = path.resolve("storage/resume");
const MASTERS_DIR = path.join(RESUME_DIR, "masters");
const TAILORED_DIR = path.join(RESUME_DIR, "tailored");
export const TEMPLATES_DIR = path.join(RESUME_DIR, "templates");
const LEGACY_MASTER_PATH = path.join(RESUME_DIR, "master.yml");

function slug(name: string): string {
    const cleaned = name.trim().replace(/[^A-Za-z0-9 _-]+/g, "").replace(/\s+/g, "-");
    return cleaned.length > 0 ? cleaned : "master";
}

export class ResumeMasterRepository implements IResumeMasterRepo {
    private async migrateLegacy(): Promise<void> {
        try {
            await fs.access(MASTERS_DIR);
            return;
        } catch {}
        try {
            const legacy = await fs.readFile(LEGACY_MASTER_PATH, "utf8");
            await fs.mkdir(MASTERS_DIR, { recursive: true });
            await fs.writeFile(path.join(MASTERS_DIR, "default.yml"), legacy, "utf8");
            await fs.rm(LEGACY_MASTER_PATH, { force: true });
        } catch {}
    }

    async listMasters(): Promise<string[]> {
        await this.migrateLegacy();
        try {
            const files = await fs.readdir(MASTERS_DIR);
            return files
                .filter((f) => f.endsWith(".yml"))
                .map((f) => f.slice(0, -4))
                .sort();
        } catch {
            return [];
        }
    }

    async readMaster(name: string): Promise<string | null> {
        await this.migrateLegacy();
        try {
            return await fs.readFile(this.masterPath(name), "utf8");
        } catch {
            return null;
        }
    }

    async writeMaster(name: string, yaml: string): Promise<void> {
        await fs.mkdir(MASTERS_DIR, { recursive: true });
        await fs.writeFile(this.masterPath(name), yaml, "utf8");
    }

    async deleteMaster(name: string): Promise<void> {
        await fs.rm(this.masterPath(name), { force: true });
    }

    async readMasterParsed(name: string): Promise<ResumeInput | null> {
        const raw = await this.readMaster(name);
        if (raw == null) return null;
        return parse(raw) as ResumeInput;
    }

    async readTailored(jobId: number): Promise<ResumeInput | null> {
        try {
            const raw = await fs.readFile(this.tailoredPath(jobId), "utf8");
            return parse(raw) as ResumeInput;
        } catch {
            return null;
        }
    }

    async readTailoredMeta(jobId: number): Promise<TailoredResumeMeta | null> {
        try {
            const raw = await fs.readFile(this.tailoredMetaPath(jobId), "utf8");
            return JSON.parse(raw) as TailoredResumeMeta;
        } catch {
            return null;
        }
    }

    async writeTailored(jobId: number, data: ResumeInput, meta: TailoredResumeMeta): Promise<void> {
        await fs.mkdir(TAILORED_DIR, { recursive: true });
        await fs.writeFile(this.tailoredPath(jobId), stringify(data), "utf8");
        await fs.writeFile(this.tailoredMetaPath(jobId), JSON.stringify(meta, null, 2), "utf8");
    }

    async deleteTailored(jobId: number): Promise<void> {
        await fs.rm(this.tailoredPath(jobId), { force: true });
        await fs.rm(this.tailoredMetaPath(jobId), { force: true });
    }

    async hasTailored(jobId: number): Promise<boolean> {
        try {
            await fs.access(this.tailoredPath(jobId));
            return true;
        } catch {
            return false;
        }
    }

    async writeTemplate(filename: string, content: string): Promise<void> {
        await fs.mkdir(TEMPLATES_DIR, { recursive: true });
        await fs.writeFile(path.join(TEMPLATES_DIR, path.basename(filename)), content, "utf8");
    }

    private masterPath(name: string): string {
        return path.join(MASTERS_DIR, `${slug(name)}.yml`);
    }

    private tailoredPath(jobId: number): string {
        return path.join(TAILORED_DIR, `${jobId}.yml`);
    }

    private tailoredMetaPath(jobId: number): string {
        return path.join(TAILORED_DIR, `${jobId}.json`);
    }
}

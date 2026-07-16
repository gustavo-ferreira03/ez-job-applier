import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { SessionManager, type SessionInfo } from "@earendil-works/pi-coding-agent";

export const MAX_EXTERNAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const SESSION_META = "external-apply-session";
const VISIBLE_MESSAGE = "external-apply-visible-message";
const RUNTIME_STATE = "external-apply-runtime-state";
const storageRoot = process.env.JOB_APPLIER_STORAGE_DIR ?? path.resolve("storage");
const sessionDir = path.join(storageRoot, "external-apply", "sessions");
const attachmentsRoot = path.join(storageRoot, "external-apply", "attachments");

const MIME_BY_EXTENSION: Record<string, string> = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".odt": "application/vnd.oasis.opendocument.text",
    ".rtf": "application/rtf",
};

export interface ExternalApplyAttachment {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
    url: string;
    localPath: string;
}

export type ExternalApplyAttachmentView = Omit<ExternalApplyAttachment, "localPath">;

export interface PersistedExternalMessage {
    id: string;
    role: "agent" | "user";
    text: string;
    ts: number;
    attachments: ExternalApplyAttachmentView[];
}

export interface PersistedExternalState {
    active: boolean;
    phase: "idle" | "working" | "waiting" | "review" | "submitted" | "failed";
    suspended: boolean;
    title: string;
    lastUrl?: string | null;
}

export interface ExternalApplySessionRecord {
    jobId: number;
    manager: SessionManager;
    messages: PersistedExternalMessage[];
    state: PersistedExternalState;
}

function flush(sm: SessionManager): void {
    const writable = sm as unknown as { _rewriteFile(): void; flushed: boolean };
    writable._rewriteFile();
    writable.flushed = true;
}

function sessionJobId(sm: SessionManager): number | null {
    for (const entry of sm.getEntries()) {
        if (entry.type !== "custom" || entry.customType !== SESSION_META) continue;
        const jobId = Number((entry.data as { jobId?: unknown } | undefined)?.jobId);
        if (Number.isInteger(jobId)) return jobId;
    }
    return null;
}

function readRecord(info: SessionInfo): ExternalApplySessionRecord | null {
    const manager = SessionManager.open(info.path, sessionDir, process.cwd());
    const jobId = sessionJobId(manager);
    if (jobId == null) return null;
    const messages: PersistedExternalMessage[] = [];
    let state: PersistedExternalState = {
        active: false,
        phase: "idle",
        suspended: false,
        title: info.name || `Job ${jobId}`,
    };
    for (const entry of manager.getEntries()) {
        if (entry.type !== "custom") continue;
        if (entry.customType === VISIBLE_MESSAGE) {
            const message = entry.data as PersistedExternalMessage | undefined;
            if (message?.id && message.text != null) messages.push({ ...message, attachments: message.attachments ?? [] });
        } else if (entry.customType === RUNTIME_STATE) {
            const next = entry.data as PersistedExternalState | undefined;
            if (next?.phase) state = next;
        }
    }
    return { jobId, manager, messages, state };
}

export async function listExternalApplySessions(): Promise<ExternalApplySessionRecord[]> {
    await fs.mkdir(sessionDir, { recursive: true });
    const infos = await SessionManager.list(process.cwd(), sessionDir);
    return infos.flatMap((info) => {
        const record = readRecord(info);
        return record ? [record] : [];
    });
}

export async function openExternalApplySession(jobId: number, title: string): Promise<ExternalApplySessionRecord> {
    const existing = (await listExternalApplySessions()).find((record) => record.jobId === jobId);
    if (existing) return existing;
    const manager = SessionManager.create(process.cwd(), sessionDir);
    manager.appendCustomEntry(SESSION_META, { jobId });
    manager.appendSessionInfo(title);
    flush(manager);
    return {
        jobId,
        manager,
        messages: [],
        state: { active: false, phase: "idle", suspended: false, title },
    };
}

export function appendExternalMessage(manager: SessionManager, message: PersistedExternalMessage): void {
    manager.appendCustomEntry(VISIBLE_MESSAGE, message);
}

export function appendExternalState(manager: SessionManager, state: PersistedExternalState): void {
    manager.appendCustomEntry(RUNTIME_STATE, state);
}

function safeFilename(filename: string): string {
    return path.basename(filename).replace(/[\r\n"]/g, "_");
}

function allowedMime(filename: string, requested?: string): string {
    const mime = MIME_BY_EXTENSION[path.extname(filename).toLowerCase()];
    if (!mime) throw new Error(`Unsupported attachment type: ${filename}`);
    if (requested && requested !== "application/octet-stream" && requested !== mime) {
        if (!(mime === "image/jpeg" && requested === "image/jpg")) throw new Error(`File type does not match its extension: ${filename}`);
    }
    return mime;
}

async function saveBuffer(jobId: number, data: Buffer, filename: string, requestedMime?: string): Promise<ExternalApplyAttachment> {
    if (data.length > MAX_EXTERNAL_ATTACHMENT_BYTES) throw new Error(`Attachment exceeds 25 MB: ${filename}`);
    const clean = safeFilename(filename);
    const mimeType = allowedMime(clean, requestedMime);
    const id = crypto.randomUUID();
    const dir = path.join(attachmentsRoot, String(jobId));
    await fs.mkdir(dir, { recursive: true });
    const localPath = path.join(dir, id);
    const attachment: ExternalApplyAttachment = {
        id,
        filename: clean,
        mimeType,
        size: data.length,
        url: `/external-apply/${jobId}/attachments/${id}`,
        localPath,
    };
    await fs.writeFile(localPath, data);
    await fs.writeFile(`${localPath}.json`, JSON.stringify(attachment));
    return attachment;
}

export async function saveUserExternalAttachment(jobId: number, file: File): Promise<ExternalApplyAttachment> {
    return saveBuffer(jobId, Buffer.from(await file.arrayBuffer()), file.name, file.type);
}

export function validateUserExternalAttachment(file: File): void {
    if (file.size > MAX_EXTERNAL_ATTACHMENT_BYTES) throw new Error(`Attachment exceeds 25 MB: ${file.name}`);
    allowedMime(file.name, file.type);
}

export async function deleteExternalAttachments(jobId: number, attachments: ExternalApplyAttachment[]): Promise<void> {
    await Promise.all(
        attachments.flatMap((attachment) => [
            fs.rm(attachment.localPath, { force: true }),
            fs.rm(`${attachment.localPath}.json`, { force: true }),
        ]),
    );
}

export async function saveAgentExternalAttachment(jobId: number, workDir: string, filePath: string): Promise<ExternalApplyAttachment> {
    const resolved = path.resolve(workDir, filePath);
    const relative = path.relative(workDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Attachment must be inside the application work directory: ${filePath}`);
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) throw new Error(`Attachment is not a file: ${filePath}`);
    return saveBuffer(jobId, await fs.readFile(resolved), path.basename(resolved));
}

export async function readExternalAttachment(jobId: number, id: string): Promise<{ data: Buffer; meta: ExternalApplyAttachment } | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const base = path.join(attachmentsRoot, String(jobId), id);
    try {
        const [data, raw] = await Promise.all([fs.readFile(base), fs.readFile(`${base}.json`, "utf8")]);
        return { data, meta: JSON.parse(raw) as ExternalApplyAttachment };
    } catch {
        return null;
    }
}

export async function clearExternalApplyStorage(): Promise<void> {
    await fs.rm(path.join(storageRoot, "external-apply"), { recursive: true, force: true });
}

export async function deleteExternalApplyStorageForJob(jobId: number): Promise<void> {
    const record = (await listExternalApplySessions()).find((session) => session.jobId === jobId);
    const sessionFile = record?.manager.getSessionFile();
    await Promise.all([
        sessionFile ? fs.rm(sessionFile, { force: true }) : Promise.resolve(),
        fs.rm(path.join(attachmentsRoot, String(jobId)), { recursive: true, force: true }),
        fs.rm(path.join(storageRoot, "external-apply", "browser", `${jobId}.json`), { force: true }),
    ]);
}

export async function externalBrowserStatePath(jobId: number): Promise<string> {
    const dir = path.join(storageRoot, "external-apply", "browser");
    await fs.mkdir(dir, { recursive: true });
    return path.join(dir, `${jobId}.json`);
}

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import type { ImageContent } from "@earendil-works/pi-ai";
import type { ChatAttachment } from "./types";

const storageRoot = process.env.JOB_APPLIER_STORAGE_DIR ?? path.resolve("storage");
const attachmentsDir = path.join(storageRoot, "chat", "attachments");
const MAX_CHAT_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_INLINE_TEXT_CHARS = 20_000;

const MIME_BY_EXTENSION: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".json": "application/json",
    ".yml": "application/yaml",
    ".yaml": "application/yaml",
};

export const ATTACHMENT_CONTEXT_MARKER = "\n[Attached files]\n";

function safeFilename(filename: string): string {
    return path.basename(filename).replace(/[\r\n"]/g, "_");
}

export async function saveAttachment(data: Buffer, filename: string, mimeType: string): Promise<ChatAttachment> {
    await fs.mkdir(attachmentsDir, { recursive: true });
    const id = crypto.randomUUID();
    const meta: ChatAttachment = { id, filename: safeFilename(filename), mimeType, size: data.length };
    await fs.writeFile(path.join(attachmentsDir, id), data);
    await fs.writeFile(path.join(attachmentsDir, `${id}.json`), JSON.stringify(meta));
    return meta;
}

export async function readAttachment(id: string): Promise<{ data: Buffer; meta: ChatAttachment } | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    try {
        const [data, raw] = await Promise.all([
            fs.readFile(path.join(attachmentsDir, id)),
            fs.readFile(path.join(attachmentsDir, `${id}.json`), "utf8"),
        ]);
        return { data, meta: JSON.parse(raw) as ChatAttachment };
    } catch {
        return null;
    }
}

export function validateUserChatAttachment(file: File): void {
    if (file.size > MAX_CHAT_ATTACHMENT_BYTES) throw new Error(`Attachment exceeds 25 MB: ${file.name}`);
    if (!MIME_BY_EXTENSION[path.extname(file.name).toLowerCase()]) throw new Error(`Unsupported attachment type: ${file.name}`);
}

export async function saveUserChatAttachment(file: File): Promise<ChatAttachment> {
    const mimeType = MIME_BY_EXTENSION[path.extname(file.name).toLowerCase()];
    if (!mimeType) throw new Error(`Unsupported attachment type: ${file.name}`);
    return saveAttachment(Buffer.from(await file.arrayBuffer()), file.name, mimeType);
}

function clipText(text: string): string {
    const clean = text.trim();
    if (clean.length <= MAX_INLINE_TEXT_CHARS) return clean;
    return `${clean.slice(0, MAX_INLINE_TEXT_CHARS)}\n[...truncated]`;
}

export async function buildAttachmentPrompt(
    attachments: ChatAttachment[],
): Promise<{ contextText: string; images: ImageContent[] }> {
    const sections: string[] = [];
    const images: ImageContent[] = [];
    for (const { id } of attachments) {
        const found = await readAttachment(id);
        if (!found) continue;
        if (found.meta.mimeType.startsWith("image/")) {
            images.push({ type: "image", data: found.data.toString("base64"), mimeType: found.meta.mimeType });
            sections.push(`- ${found.meta.filename}: image, shown to you directly`);
            continue;
        }
        if (found.meta.mimeType === "application/pdf") {
            try {
                const result = await new PDFParse({ data: found.data }).getText();
                sections.push(`- ${found.meta.filename} (PDF):\n${clipText(result.text)}`);
            } catch {
                sections.push(`- ${found.meta.filename} (PDF): text could not be extracted`);
            }
            continue;
        }
        sections.push(`- ${found.meta.filename}:\n${clipText(found.data.toString("utf8"))}`);
    }
    if (sections.length === 0) return { contextText: "", images };
    return { contextText: `\n${ATTACHMENT_CONTEXT_MARKER}${sections.join("\n\n")}`, images };
}

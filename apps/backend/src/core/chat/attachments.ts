import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ChatAttachment } from "./types";

const storageRoot = process.env.JOB_APPLIER_STORAGE_DIR ?? path.resolve("storage");
const attachmentsDir = path.join(storageRoot, "chat", "attachments");

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

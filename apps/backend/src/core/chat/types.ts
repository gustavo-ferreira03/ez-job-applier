export type ChatRole = "user" | "agent";

export interface ChatAttachment {
    id: string;
    filename: string;
    mimeType: string;
    size: number;
}

export interface ChatThread {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
}

export interface ChatMessageRecord {
    id: string;
    threadId: string;
    role: ChatRole;
    content: string;
    attachments: ChatAttachment[];
    createdAt: string;
}

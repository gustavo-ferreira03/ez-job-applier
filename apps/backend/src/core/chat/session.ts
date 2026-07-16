import fs from "node:fs/promises";
import path from "node:path";
import { SessionManager, createAgentSession, type SessionEntry, type SessionInfo } from "@earendil-works/pi-coding-agent";
import type { AppContext } from "../context";
import { getSettings } from "../../repositories/settings";
import { createChatTools } from "./tools";
import type { ChatAttachment, ChatMessageRecord, ChatThread } from "./types";

const busyThreads = new Set<string>();
const SESSION_SYSTEM_TYPE = "job-applier-assistant-system";
const ATTACHMENTS_TYPE = "job-applier-attachments";
const storageRoot = process.env.JOB_APPLIER_STORAGE_DIR ?? path.resolve("storage");
const sessionDir = path.join(storageRoot, "chat", "sessions");
const cwd = process.cwd();

export function isThreadBusy(threadId: string): boolean {
    return busyThreads.has(threadId);
}

function systemPrompt(): string {
    return [
        "You are the assistant inside a job-application tool. You chat with the user like a normal, helpful assistant, and you can also act on their job pipeline through your tools.",
        "Reply in the same language the user writes in.",
        "Keep answers concise and direct. Do not invent facts about the user's pipeline — call a tool to check.",
        "When the user pastes a job link, you may ingest it. When they ask to tailor a résumé, apply, or check status, use the matching tool.",
        "You CAN read the candidate's résumé with read_resume. Never tell the user you have no access to it.",
        "NEVER claim an action succeeded unless the tool result says it did. If a tool reports it refused, failed, or could not read something, tell the user exactly that. Do not soften it, do not report success, and never invent job titles, companies or ids — use only the values the tool returned.",
        "Answer in the chat itself: show the job details, the résumé content and the PDF link inline. Do not send the user to the pipeline to find something you can show here.",
        "Before applying to any job you MUST get an explicit confirmation from the user in the conversation; never apply on a first mention.",
    ].join("\n");
}

interface AgentMessage {
    role?: string;
    content?: unknown;
    stopReason?: string;
    errorMessage?: string;
}

function extractText(message: AgentMessage | undefined): string {
    const content = message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .filter((p): p is { type: string; text: string } => typeof p === "object" && p !== null && (p as { type?: string }).type === "text")
            .map((p) => p.text)
            .join("");
    }
    return "";
}

function threadFromInfo(info: SessionInfo): ChatThread {
    const piName = info.name && info.name !== "New chat" ? info.name : undefined;
    const firstMessage = info.firstMessage && info.firstMessage !== "(no messages)" ? info.firstMessage : undefined;
    return {
        id: info.id,
        title: piName || firstMessage || "New chat",
        createdAt: info.created.toISOString(),
        updatedAt: info.modified.toISOString(),
    };
}

async function listSessionInfos(): Promise<SessionInfo[]> {
    await fs.mkdir(sessionDir, { recursive: true });
    return SessionManager.list(cwd, sessionDir);
}

async function findSessionInfo(id: string): Promise<SessionInfo | null> {
    const sessions = await listSessionInfos();
    return sessions.find((s) => s.id === id) ?? null;
}

function ensureSystemPrompt(sm: SessionManager): void {
    const hasSystem = sm.getEntries().some((entry) => entry.type === "custom_message" && entry.customType === SESSION_SYSTEM_TYPE);
    if (!hasSystem) sm.appendCustomMessageEntry(SESSION_SYSTEM_TYPE, systemPrompt(), false);
}

function flushSessionFile(sm: SessionManager): void {
    const writable = sm as unknown as { _rewriteFile(): void; flushed: boolean };
    writable._rewriteFile();
    writable.flushed = true;
}

export async function listChatThreads(): Promise<ChatThread[]> {
    return (await listSessionInfos()).map(threadFromInfo);
}

export async function createChatThread(id: string): Promise<ChatThread> {
    await fs.mkdir(sessionDir, { recursive: true });
    const sm = SessionManager.create(cwd, sessionDir, { id });
    flushSessionFile(sm);
    const now = new Date().toISOString();
    return { id: sm.getSessionId(), title: "New chat", createdAt: now, updatedAt: now };
}

export async function openChatSession(id: string): Promise<SessionManager | null> {
    const info = await findSessionInfo(id);
    if (!info) return null;
    return SessionManager.open(info.path, sessionDir, cwd);
}

export async function getChatThread(id: string): Promise<ChatThread | null> {
    const info = await findSessionInfo(id);
    return info ? threadFromInfo(info) : null;
}

export async function renameChatThread(id: string, title: string): Promise<void> {
    const sm = await openChatSession(id);
    if (!sm) return;
    sm.appendSessionInfo(title);
}

export async function deleteChatThread(id: string): Promise<void> {
    const info = await findSessionInfo(id);
    if (!info) return;
    await fs.unlink(info.path).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== "ENOENT") throw e;
    });
}

export function messagesFromSession(id: string, sm: SessionManager): ChatMessageRecord[] {
    const messages: ChatMessageRecord[] = [];
    for (const entry of sm.getEntries()) {
        if (entry.type === "custom_message" && entry.display) {
            const content = extractText({ role: "assistant", content: entry.content }).trim();
            if (content) {
                messages.push({
                    id: entry.id,
                    threadId: id,
                    role: "agent",
                    content,
                    attachments: [],
                    createdAt: entry.timestamp,
                });
            }
            continue;
        }
        if (entry.type === "custom" && entry.customType === ATTACHMENTS_TYPE) {
            const data = entry.data as { attachments?: ChatAttachment[] } | undefined;
            const last = messages[messages.length - 1];
            if (last?.role === "agent" && Array.isArray(data?.attachments)) last.attachments.push(...data.attachments);
            continue;
        }
        if (entry.type === "message") {
            const role = entry.message.role;
            if (role !== "user" && role !== "assistant") continue;
            const content = extractText(entry.message as AgentMessage).trim();
            if (!content) continue;
            messages.push({
                id: entry.id,
                threadId: id,
                role: role === "user" ? "user" : "agent",
                content,
                attachments: [],
                createdAt: entry.timestamp,
            });
        }
    }
    return messages;
}

export async function runChatTurn(threadId: string, userText: string, ctx: AppContext): Promise<void> {
    if (busyThreads.has(threadId)) return;
    busyThreads.add(threadId);
    try {
        const sm = await openChatSession(threadId);
        if (!sm) return;
        ensureSystemPrompt(sm);

        const settings = await getSettings();
        const model = ctx.modelRegistry.find(settings.llm.provider, settings.llm.model);
        if (!model) {
            sm.appendCustomMessageEntry(
                "job-applier-assistant-error",
                `LLM model not configured (${settings.llm.provider}/${settings.llm.model}). Set it in Settings.`,
                true,
            );
            flushSessionFile(sm);
            return;
        }

        const attachments: ChatAttachment[] = [];
        const { session } = await createAgentSession({
            model,
            modelRegistry: ctx.modelRegistry,
            cwd,
            noTools: "builtin",
            customTools: createChatTools(ctx, threadId, (attachment) => attachments.push(attachment)),
            sessionManager: sm,
        });

        let errorText = "";
        const unsubscribe = session.subscribe((event) => {
            const e = event as { type?: string; message?: AgentMessage; messages?: AgentMessage[] };
            const messages = e.type === "agent_end" && Array.isArray(e.messages) ? e.messages : e.message ? [e.message] : [];
            for (const m of messages) {
                if (m.role === "assistant" && m.stopReason === "error" && m.errorMessage) errorText = m.errorMessage;
            }
        });

        try {
            await session.prompt(userText);
        } catch (e) {
            sm.appendCustomMessageEntry("job-applier-assistant-error", `The model couldn't respond: ${String(e)}`, true);
            flushSessionFile(sm);
        } finally {
            unsubscribe();
            session.dispose();
        }

        if (errorText) {
            sm.appendCustomMessageEntry("job-applier-assistant-error", `The model couldn't respond: ${errorText}`, true);
            flushSessionFile(sm);
        }
        if (attachments.length > 0) sm.appendCustomEntry(ATTACHMENTS_TYPE, { attachments });
    } finally {
        busyThreads.delete(threadId);
    }
}

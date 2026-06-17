import crypto from "node:crypto";

export type ExternalApplyPhase = "idle" | "working" | "waiting" | "submitted" | "failed";

export interface ChatMessage {
    id: string;
    role: "agent" | "user";
    text: string;
    ts: number;
}

export interface ExternalApplyStatus {
    active: boolean;
    jobId: number | null;
    title: string | null;
    phase: ExternalApplyPhase;
    messages: ChatMessage[];
}

export type AskResolution = { kind: "reply"; text: string } | { kind: "stop" };

interface SessionHandle {
    steer: (text: string) => void;
    abort: () => void;
}

const status: ExternalApplyStatus = {
    active: false,
    jobId: null,
    title: null,
    phase: "idle",
    messages: [],
};

let pendingAsk: ((resolution: AskResolution) => void) | null = null;
let session: SessionHandle | null = null;
let onPhase: ((phase: ExternalApplyPhase) => void) | null = null;
let stopping = false;

function setPhase(phase: ExternalApplyPhase): void {
    status.phase = phase;
    onPhase?.(phase);
}

function push(role: ChatMessage["role"], text: string): void {
    status.messages.push({ id: crypto.randomUUID(), role, text, ts: Date.now() });
}

export function getExternalApplyStatus(): ExternalApplyStatus {
    return { ...status, messages: [...status.messages] };
}

export function beginJob(jobId: number, title: string, phaseListener: (phase: ExternalApplyPhase) => void): void {
    status.active = true;
    status.jobId = jobId;
    status.title = title;
    status.messages = [];
    pendingAsk = null;
    session = null;
    stopping = false;
    onPhase = phaseListener;
    setPhase("working");
}

export function registerSession(handle: SessionHandle): void {
    session = handle;
}

export function endJob(phase: "submitted" | "failed"): void {
    status.active = false;
    status.phase = phase;
    pendingAsk = null;
    session = null;
    onPhase = null;
    stopping = false;
}

export function postAgentMessage(text: string): void {
    if (text.trim()) push("agent", text.trim());
}

export function askUser(question: string): Promise<AskResolution> {
    if (question.trim()) push("agent", question.trim());
    setPhase("waiting");
    return new Promise<AskResolution>((resolve) => {
        pendingAsk = resolve;
    });
}

export function sendUserMessage(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed || !status.active) return false;
    push("user", trimmed);
    if (pendingAsk) {
        const resolve = pendingAsk;
        pendingAsk = null;
        setPhase("working");
        resolve({ kind: "reply", text: trimmed });
    } else {
        session?.steer(trimmed);
    }
    return true;
}

export function stopExternalApply(): boolean {
    if (!status.active) return false;
    stopping = true;
    push("user", "Stop");
    if (pendingAsk) {
        const resolve = pendingAsk;
        pendingAsk = null;
        resolve({ kind: "stop" });
    }
    session?.abort();
    return true;
}

export function isStopping(): boolean {
    return stopping;
}

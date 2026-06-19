import crypto from "node:crypto";

export type ExternalApplyPhase = "idle" | "working" | "waiting" | "review" | "submitted" | "failed";
export const MAX_WORKING_EXTERNAL_APPLY = 2;

export interface ChatMessage {
    id: string;
    role: "agent" | "user";
    text: string;
    ts: number;
}

export interface ExternalApplySessionStatus {
    active: boolean;
    jobId: number;
    title: string;
    vncSessionId: string | null;
    phase: ExternalApplyPhase;
    messages: ChatMessage[];
}

export interface ExternalApplyStatus {
    sessions: ExternalApplySessionStatus[];
}

export type AskResolution = { kind: "reply"; text: string } | { kind: "stop" };

interface SessionHandle {
    steer: (text: string) => void;
    abort: () => void;
}

interface RuntimeSession {
    status: ExternalApplySessionStatus;
    pendingAsk: ((resolution: AskResolution) => void) | null;
    handle: SessionHandle | null;
    onPhase: ((phase: ExternalApplyPhase) => void) | null;
    stopping: boolean;
}

const sessions = new Map<number, RuntimeSession>();
const workingReservations = new Set<number>();
const workingWaiters: { jobId: number; resolve: (ok: boolean) => void }[] = [];

function publicStatus(session: RuntimeSession): ExternalApplySessionStatus {
    return { ...session.status, messages: [...session.status.messages] };
}

function getSession(jobId: number): RuntimeSession | null {
    return sessions.get(jobId) ?? null;
}

function requireSession(jobId: number): RuntimeSession {
    const session = getSession(jobId);
    if (!session) throw new Error(`No external-apply session for job ${jobId}`);
    return session;
}

function workingSlotCount(): number {
    let count = 0;
    for (const session of sessions.values()) {
        if (session.status.active && session.status.phase === "working") count += 1;
    }
    for (const jobId of workingReservations) {
        const session = getSession(jobId);
        if (!session || session.status.phase !== "working") count += 1;
    }
    return count;
}

function wakeWorkingWaiters(): void {
    while (workingWaiters.length > 0 && workingSlotCount() < MAX_WORKING_EXTERNAL_APPLY) {
        const waiter = workingWaiters.shift();
        if (!waiter) return;
        const session = getSession(waiter.jobId);
        if (!session || !session.status.active) {
            waiter.resolve(false);
            continue;
        }
        workingReservations.add(waiter.jobId);
        waiter.resolve(true);
    }
}

function cancelWorkingWait(jobId: number): void {
    for (let i = workingWaiters.length - 1; i >= 0; i -= 1) {
        if (workingWaiters[i].jobId === jobId) {
            const [waiter] = workingWaiters.splice(i, 1);
            waiter.resolve(false);
        }
    }
}

function setPhase(session: RuntimeSession, phase: ExternalApplyPhase): void {
    const previous = session.status.phase;
    if (phase === "working") workingReservations.delete(session.status.jobId);
    session.status.phase = phase;
    session.onPhase?.(phase);
    if (previous === "working" && phase !== "working") wakeWorkingWaiters();
}

function push(session: RuntimeSession, role: ChatMessage["role"], text: string): void {
    session.status.messages.push({ id: crypto.randomUUID(), role, text, ts: Date.now() });
}

export function getExternalApplyStatus(): ExternalApplyStatus {
    return { sessions: [...sessions.values()].map(publicStatus) };
}

export function beginJob(
    jobId: number,
    title: string,
    vncSessionId: string,
    phaseListener: (phase: ExternalApplyPhase) => void,
): void {
    const session: RuntimeSession = {
        status: {
            active: true,
            jobId,
            title,
            vncSessionId,
            phase: "working",
            messages: [],
        },
        pendingAsk: null,
        handle: null,
        onPhase: phaseListener,
        stopping: false,
    };
    sessions.set(jobId, session);
    workingReservations.delete(jobId);
    phaseListener("working");
}

export function registerSession(jobId: number, handle: SessionHandle): void {
    requireSession(jobId).handle = handle;
}

export function endJob(jobId: number, phase: "submitted" | "failed"): void {
    const session = getSession(jobId);
    if (!session) return;
    const previous = session.status.phase;
    session.status.active = false;
    session.status.phase = phase;
    session.status.vncSessionId = null;
    session.pendingAsk = null;
    session.handle = null;
    session.onPhase = null;
    session.stopping = false;
    workingReservations.delete(jobId);
    cancelWorkingWait(jobId);
    if (previous === "working") wakeWorkingWaiters();
}

export function postAgentMessage(jobId: number, text: string): void {
    const session = getSession(jobId);
    if (session && text.trim()) push(session, "agent", text.trim());
}

export function askUser(jobId: number, question: string, phase: "waiting" | "review" = "waiting"): Promise<AskResolution> {
    const session = requireSession(jobId);
    if (question.trim()) push(session, "agent", question.trim());
    setPhase(session, phase);
    return new Promise<AskResolution>((resolve) => {
        session.pendingAsk = resolve;
    });
}

export async function sendUserMessage(jobId: number, text: string): Promise<boolean> {
    const trimmed = text.trim();
    const session = getSession(jobId);
    if (!trimmed || !session || !session.status.active) return false;
    push(session, "user", trimmed);
    if (session.pendingAsk) {
        const resolve = session.pendingAsk;
        const ok = await waitForWorkingSlot(jobId);
        const current = getSession(jobId);
        if (!ok || !current || !current.status.active || current.pendingAsk !== resolve) {
            if (ok) releaseWorkingSlotReservation(jobId);
            return false;
        }
        current.pendingAsk = null;
        setPhase(current, "working");
        resolve({ kind: "reply", text: trimmed });
    } else {
        session.handle?.steer(trimmed);
    }
    return true;
}

export function stopExternalApply(jobId: number): boolean {
    const session = getSession(jobId);
    if (!session || !session.status.active) return false;
    session.stopping = true;
    workingReservations.delete(jobId);
    cancelWorkingWait(jobId);
    push(session, "user", "Stop");
    if (session.pendingAsk) {
        const resolve = session.pendingAsk;
        session.pendingAsk = null;
        resolve({ kind: "stop" });
    }
    session.handle?.abort();
    wakeWorkingWaiters();
    return true;
}

export function isStopping(jobId: number): boolean {
    return getSession(jobId)?.stopping ?? false;
}

export function isExternalApplyActive(jobId: number): boolean {
    return getSession(jobId)?.status.active ?? false;
}

export function workingExternalApplySlots(): number {
    return workingSlotCount();
}

export function tryReserveWorkingSlot(jobId: number): boolean {
    if (workingReservations.has(jobId)) return true;
    if (workingSlotCount() >= MAX_WORKING_EXTERNAL_APPLY) return false;
    workingReservations.add(jobId);
    return true;
}

export function releaseWorkingSlotReservation(jobId: number): void {
    if (workingReservations.delete(jobId)) wakeWorkingWaiters();
}

function waitForWorkingSlot(jobId: number): Promise<boolean> {
    if (tryReserveWorkingSlot(jobId)) return Promise.resolve(true);
    return new Promise((resolve) => {
        workingWaiters.push({ jobId, resolve });
    });
}

import crypto from "node:crypto";
import type { SessionManager } from "@earendil-works/pi-coding-agent";
import { agentAttention } from "../../events";
import {
    appendExternalMessage,
    appendExternalState,
    type ExternalApplyAttachment,
    type ExternalApplyAttachmentView,
    type ExternalApplySessionRecord,
} from "./persistence";

export type ExternalApplyPhase = "idle" | "working" | "waiting" | "review" | "submitted" | "failed";

let maxWorkingExternalApply = 1;

export function setMaxWorkingExternalApply(value: number): void {
    const next = Math.max(1, Math.min(4, Math.floor(value)));
    if (next === maxWorkingExternalApply) return;
    maxWorkingExternalApply = next;
    wakeWorkingWaiters();
}

export function getMaxWorkingExternalApply(): number {
    return maxWorkingExternalApply;
}

export interface ChatMessage {
    id: string;
    role: "agent" | "user";
    text: string;
    ts: number;
    attachments: ExternalApplyAttachmentView[];
}

export interface ExternalApplySessionStatus {
    active: boolean;
    jobId: number;
    title: string;
    vncSessionId: string | null;
    phase: ExternalApplyPhase;
    suspended: boolean;
    messages: ChatMessage[];
}

export interface ExternalApplyStatus {
    sessions: ExternalApplySessionStatus[];
}

export type AskResolution = { kind: "reply"; text: string } | { kind: "stop" };

const HIBERNATE_IDLE_MS = 180_000;
const MAX_RESUME_FAILURES = 3;

interface SessionHandle {
    steer: (text: string) => void;
    abort: () => void;
    suspend: () => Promise<void>;
    resume: () => Promise<void>;
}

interface RuntimeSession {
    status: ExternalApplySessionStatus;
    pendingAsk: ((resolution: AskResolution) => void) | null;
    handle: SessionHandle | null;
    onPhase: ((phase: ExternalApplyPhase) => void) | null;
    stopping: boolean;
    watchers: number;
    idleTimer: ReturnType<typeof setTimeout> | null;
    transitioning: boolean;
    resumeFailures: number;
    manager: SessionManager | null;
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
    while (workingWaiters.length > 0 && workingSlotCount() < maxWorkingExternalApply) {
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
    persistState(session);
    session.onPhase?.(phase);
    if (previous === "working" && phase !== "working") wakeWorkingWaiters();
    if (phase === "waiting" || phase === "review") armIdleTimer(session);
    else clearIdleTimer(session);
}

function clearIdleTimer(session: RuntimeSession): void {
    if (session.idleTimer) {
        clearTimeout(session.idleTimer);
        session.idleTimer = null;
    }
}

function armIdleTimer(session: RuntimeSession): void {
    clearIdleTimer(session);
    if (!session.status.active || session.status.suspended || session.watchers > 0) return;
    session.idleTimer = setTimeout(() => {
        session.idleTimer = null;
        void hibernate(session);
    }, HIBERNATE_IDLE_MS);
}

async function hibernate(session: RuntimeSession): Promise<void> {
    if (session.transitioning || session.status.suspended || !session.status.active) return;
    if (session.watchers > 0 || !session.pendingAsk || !session.handle) return;
    if (session.status.phase !== "waiting" && session.status.phase !== "review") return;
    session.transitioning = true;
    try {
        await session.handle.suspend();
        session.status.suspended = true;
        session.status.vncSessionId = null;
        persistState(session);
    } catch (e) {
        console.error(`[external-apply] hibernate failed for job ${session.status.jobId}:`, e);
    } finally {
        session.transitioning = false;
    }
}

async function wakeFromHibernation(session: RuntimeSession): Promise<boolean> {
    if (!session.status.suspended || !session.handle) return true;
    if (session.transitioning) return false;
    session.transitioning = true;
    try {
        await session.handle.resume();
        session.status.suspended = false;
        session.resumeFailures = 0;
        persistState(session);
        return true;
    } catch (e) {
        console.error(`[external-apply] resume failed for job ${session.status.jobId}:`, e);
        session.resumeFailures += 1;
        if (session.resumeFailures >= MAX_RESUME_FAILURES) abortSuspendedSession(session);
        return false;
    } finally {
        session.transitioning = false;
    }
}

function abortSuspendedSession(session: RuntimeSession): void {
    clearIdleTimer(session);
    push(session, "agent", "I couldn't reopen the browser to continue. Stopping this application.");
    const resolve = session.pendingAsk;
    session.pendingAsk = null;
    session.handle?.abort();
    resolve?.({ kind: "stop" });
}

function persistState(session: RuntimeSession): void {
    if (!session.manager) return;
    appendExternalState(session.manager, {
        active: session.status.active,
        phase: session.status.phase,
        suspended: session.status.suspended,
        title: session.status.title,
    });
}

export function updateVncSession(jobId: number, vncSessionId: string | null): void {
    const session = getSession(jobId);
    if (session) session.status.vncSessionId = vncSessionId;
}

export function noteVncConnect(vncSessionId: string): void {
    for (const session of sessions.values()) {
        if (session.status.vncSessionId === vncSessionId) {
            session.watchers += 1;
            clearIdleTimer(session);
            return;
        }
    }
}

export function noteVncDisconnect(vncSessionId: string): void {
    for (const session of sessions.values()) {
        if (session.status.vncSessionId === vncSessionId) {
            session.watchers = Math.max(0, session.watchers - 1);
            if (session.watchers === 0) armIdleTimer(session);
            return;
        }
    }
}

export async function resumeExternalApply(jobId: number): Promise<boolean> {
    const session = getSession(jobId);
    if (!session || !session.status.active) return false;
    if (session.status.suspended && !session.handle) return false;
    return wakeFromHibernation(session);
}

function push(session: RuntimeSession, role: ChatMessage["role"], text: string, attachments: ExternalApplyAttachment[] = []): void {
    const visibleAttachments = attachments.map(({ localPath: _localPath, ...attachment }) => attachment);
    const message = { id: crypto.randomUUID(), role, text, ts: Date.now(), attachments: visibleAttachments };
    session.status.messages.push(message);
    if (session.manager) appendExternalMessage(session.manager, message);
}

export function getExternalApplyStatus(): ExternalApplyStatus {
    return { sessions: [...sessions.values()].map(publicStatus) };
}

export function hasExternalApplySession(jobId: number): boolean {
    return sessions.has(jobId);
}

export function beginJob(
    jobId: number,
    title: string,
    vncSessionId: string,
    phaseListener: (phase: ExternalApplyPhase) => void,
): void {
    const previous = sessions.get(jobId);
    const session: RuntimeSession = {
        status: {
            active: true,
            jobId,
            title,
            vncSessionId,
            phase: "working",
            suspended: false,
            messages: previous?.status.messages ?? [],
        },
        pendingAsk: null,
        handle: null,
        onPhase: phaseListener,
        stopping: false,
        watchers: 0,
        idleTimer: null,
        transitioning: false,
        resumeFailures: 0,
        manager: previous?.manager ?? null,
    };
    sessions.set(jobId, session);
    workingReservations.delete(jobId);
    phaseListener("working");
    persistState(session);
}

export function bindExternalApplySession(jobId: number, record: ExternalApplySessionRecord): void {
    const session = requireSession(jobId);
    session.manager = record.manager;
    if (session.status.messages.length === 0) session.status.messages = [...record.messages];
    persistState(session);
}

export function hydrateExternalApplySessions(records: ExternalApplySessionRecord[]): void {
    for (const record of records) {
        const interrupted = record.state.active;
        sessions.set(record.jobId, {
            status: {
                active: interrupted,
                jobId: record.jobId,
                title: record.state.title,
                vncSessionId: null,
                phase: record.state.phase,
                suspended: interrupted,
                messages: [...record.messages],
            },
            pendingAsk: null,
            handle: null,
            onPhase: null,
            stopping: false,
            watchers: 0,
            idleTimer: null,
            transitioning: false,
            resumeFailures: 0,
            manager: record.manager,
        });
    }
}

export function takeRestoredSessionForResume(jobId: number): boolean {
    const session = getSession(jobId);
    if (!session || !session.status.active || !session.status.suspended || session.handle) return false;
    session.status.active = false;
    return true;
}

export function restoreSuspendedSession(jobId: number): void {
    const session = getSession(jobId);
    if (!session || session.handle) return;
    session.status.active = true;
    session.status.suspended = true;
}

export function registerSession(jobId: number, handle: SessionHandle): void {
    requireSession(jobId).handle = handle;
}

export function endJob(jobId: number, phase: "submitted" | "failed"): void {
    const session = getSession(jobId);
    if (!session) return;
    const previous = session.status.phase;
    clearIdleTimer(session);
    session.status.active = false;
    session.status.phase = phase;
    session.status.vncSessionId = null;
    session.status.suspended = false;
    session.pendingAsk = null;
    session.handle = null;
    session.onPhase = null;
    session.stopping = false;
    persistState(session);
    workingReservations.delete(jobId);
    cancelWorkingWait(jobId);
    if (previous === "working") wakeWorkingWaiters();
}

export function postAgentMessage(jobId: number, text: string, attachments: ExternalApplyAttachment[] = []): void {
    const session = getSession(jobId);
    if (session && (text.trim() || attachments.length > 0)) push(session, "agent", text.trim(), attachments);
}

export function askUser(
    jobId: number,
    question: string,
    phase: "waiting" | "review" = "waiting",
    screenshotPath?: string,
    attachments: ExternalApplyAttachment[] = [],
): Promise<AskResolution> {
    const session = requireSession(jobId);
    const trimmed = question.trim();
    if (trimmed || attachments.length > 0) push(session, "agent", trimmed, attachments);
    setPhase(session, phase);
    agentAttention.emit({ jobId, title: session.status.title, question: trimmed, phase, screenshotPath });
    return new Promise<AskResolution>((resolve) => {
        session.pendingAsk = resolve;
    });
}

export async function sendUserMessage(jobId: number, text: string, attachments: ExternalApplyAttachment[] = []): Promise<boolean> {
    const trimmed = text.trim() || (attachments.length > 0 ? "I attached files for this application." : "");
    const session = getSession(jobId);
    if (!trimmed || !session) return false;
    const attachmentContext = attachments.length > 0
        ? `\n\nAttached files available locally:\n${attachments.map((a) => `- ${a.filename}: ${a.localPath}`).join("\n")}`
        : "";
    if (!session.status.active || !session.handle) {
        push(session, "user", trimmed, attachments);
        session.manager?.appendCustomMessageEntry("external-apply-pending-user-message", `${trimmed}${attachmentContext}`, false, { attachments });
        return true;
    }
    if (session.pendingAsk) {
        const resolve = session.pendingAsk;
        const ok = await waitForWorkingSlot(jobId);
        const current = getSession(jobId);
        if (!ok || !current || !current.status.active || current.pendingAsk !== resolve) {
            if (ok) releaseWorkingSlotReservation(jobId);
            return false;
        }
        if (current.status.suspended) {
            const woke = await wakeFromHibernation(current);
            if (!woke || current.pendingAsk !== resolve) {
                releaseWorkingSlotReservation(jobId);
                return false;
            }
        }
        push(current, "user", trimmed, attachments);
        current.pendingAsk = null;
        setPhase(current, "working");
        resolve({ kind: "reply", text: `${trimmed}${attachmentContext}` });
    } else {
        push(session, "user", trimmed, attachments);
        session.handle?.steer(`${trimmed}${attachmentContext}`);
    }
    return true;
}

export function stopExternalApply(jobId: number): boolean {
    const session = getSession(jobId);
    if (!session || !session.status.active) return false;
    session.stopping = true;
    clearIdleTimer(session);
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
    if (workingSlotCount() >= maxWorkingExternalApply) return false;
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

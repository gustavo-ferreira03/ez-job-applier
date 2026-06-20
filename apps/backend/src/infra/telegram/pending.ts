import type { ApplicationStatus } from "../../core/types";

export type PendingAction =
    | { kind: "easyapply-form"; jobId: number; labels: string[] }
    | { kind: "easyapply-review"; jobId: number }
    | { kind: "agent-ask"; jobId: number }
    | { kind: "agent-review"; jobId: number };

const byMessageId = new Map<number, PendingAction>();
const lastStatus = new Map<number, ApplicationStatus>();

export function rememberPending(messageId: number, action: PendingAction): void {
    byMessageId.set(messageId, action);
}

export function lookupPending(messageId: number): PendingAction | null {
    return byMessageId.get(messageId) ?? null;
}

export function forgetPending(messageId: number): void {
    byMessageId.delete(messageId);
}

export function markStatus(jobId: number, status: ApplicationStatus): boolean {
    const previous = lastStatus.get(jobId);
    lastStatus.set(jobId, status);
    return previous !== status;
}

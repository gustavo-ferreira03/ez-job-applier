export type ApprovalDecision = "approve" | "reject";

export interface ExternalApplyStatus {
    active: boolean;
    awaitingApproval: boolean;
    jobId: number | null;
    title: string | null;
    summary: string | null;
}

const status: ExternalApplyStatus = {
    active: false,
    awaitingApproval: false,
    jobId: null,
    title: null,
    summary: null,
};

let pending: ((decision: ApprovalDecision) => void) | null = null;

export function getExternalApplyStatus(): ExternalApplyStatus {
    return { ...status };
}

export function beginJob(jobId: number, title: string): void {
    status.active = true;
    status.jobId = jobId;
    status.title = title;
    status.awaitingApproval = false;
    status.summary = null;
}

export function endJob(): void {
    status.active = false;
    status.jobId = null;
    status.title = null;
    status.awaitingApproval = false;
    status.summary = null;
    pending = null;
}

export function requestApproval(summary: string): Promise<ApprovalDecision> {
    status.awaitingApproval = true;
    status.summary = summary;
    return new Promise<ApprovalDecision>((resolve) => {
        pending = (decision) => {
            status.awaitingApproval = false;
            status.summary = null;
            resolve(decision);
        };
    });
}

export function decideApproval(decision: ApprovalDecision): boolean {
    if (!pending) return false;
    const resolve = pending;
    pending = null;
    resolve(decision);
    return true;
}

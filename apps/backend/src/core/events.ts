import type { ApplicationStatus } from "./types";

type Listener<T> = (payload: T) => void;

export class Emitter<T> {
    private listeners = new Set<Listener<T>>();

    on(fn: Listener<T>): void {
        this.listeners.add(fn);
    }

    emit(payload: T): void {
        for (const fn of this.listeners) {
            try {
                fn(payload);
            } catch (e) {
                console.error("[events] listener failed:", e);
            }
        }
    }
}

export interface ApplicationStatusChanged {
    jobId: number;
    status: ApplicationStatus;
}

export interface AgentAttention {
    jobId: number;
    title: string;
    question: string;
    phase: "waiting" | "review";
    screenshotPath?: string;
}

export const applicationStatusChanged = new Emitter<ApplicationStatusChanged>();
export const agentAttention = new Emitter<AgentAttention>();

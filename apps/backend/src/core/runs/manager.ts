import { EventEmitter } from "node:events";
import type { DiscoverConfig, Job, ApplicationStatus } from "../types";
import { discoverJobs } from "../usecases/discoverJobs";
import { applyToJob } from "../usecases/applyToJob";

export type RunStatus = "running" | "done" | "cancelled" | "failed";

export interface RunStats {
    discovered: number;
    submitted: number;
    needsInput: number;
    skipped: number;
    failed: number;
    external: number;
}

export interface Run {
    id: string;
    config: DiscoverConfig;
    status: RunStatus;
    stats: RunStats;
    startedAt: Date;
    finishedAt?: Date;
    errorMessage?: string;
}

export type RunEventPayload =
    | { type: "job_found"; job: Job }
    | { type: "applying"; jobId: string; title: string; company: string }
    | { type: "result"; jobId: string; title: string; status: ApplicationStatus; errorMessage?: string }
    | { type: "done"; stats: RunStats }
    | { type: "cancelled" }
    | { type: "error"; message: string };

export interface RunEvent {
    id: number;
    timestamp: string;
    payload: RunEventPayload;
}

class RunManager {
    private emitter = new EventEmitter();
    private current: Run | null = null;
    private abort: AbortController | null = null;
    private buffer: RunEvent[] = [];
    private counter = 0;
    private readonly BUFFER_SIZE = 500;

    getCurrent(): Run | null {
        return this.current;
    }

    getEventsSince(lastId: number): RunEvent[] {
        return this.buffer.filter((e) => e.id > lastId);
    }

    onEvent(listener: (event: RunEvent) => void): () => void {
        this.emitter.on("event", listener);
        return () => this.emitter.off("event", listener);
    }

    start(config: DiscoverConfig): Run {
        if (this.current?.status === "running") {
            throw new Error("A run is already in progress");
        }

        this.abort = new AbortController();
        const run: Run = {
            id: crypto.randomUUID(),
            config,
            status: "running",
            stats: { discovered: 0, submitted: 0, needsInput: 0, skipped: 0, failed: 0, external: 0 },
            startedAt: new Date(),
        };
        this.current = run;
        this.buffer = [];

        this.runWorker(run, this.abort.signal).catch((err) => {
            run.status = "failed";
            run.errorMessage = err instanceof Error ? err.message : String(err);
            run.finishedAt = new Date();
            this.push({ type: "error", message: run.errorMessage });
        });

        return run;
    }

    cancel(): boolean {
        if (!this.current || this.current.status !== "running") return false;
        this.abort?.abort();
        return true;
    }

    private push(payload: RunEventPayload): void {
        const event: RunEvent = {
            id: ++this.counter,
            timestamp: new Date().toISOString(),
            payload,
        };
        this.buffer.push(event);
        if (this.buffer.length > this.BUFFER_SIZE) this.buffer.shift();
        this.emitter.emit("event", event);
    }

    private async runWorker(run: Run, signal: AbortSignal): Promise<void> {
        const jobs: Job[] = [];

        for await (const job of discoverJobs(run.config)) {
            if (signal.aborted) break;
            run.stats.discovered++;
            jobs.push(job);
            this.push({ type: "job_found", job });
        }

        if (signal.aborted) {
            run.status = "cancelled";
            run.finishedAt = new Date();
            this.push({ type: "cancelled" });
            return;
        }

        for (const job of jobs) {
            if (signal.aborted) break;

            this.push({ type: "applying", jobId: job.jobId, title: job.title, company: job.company });

            try {
                const result = await applyToJob(job.jobId);

                switch (result.status) {
                    case "SUBMITTED": run.stats.submitted++; break;
                    case "NEEDS_INPUT": run.stats.needsInput++; break;
                    case "SKIPPED": run.stats.skipped++; break;
                    case "FAILED": run.stats.failed++; break;
                    case "EXTERNAL": run.stats.external++; break;
                }

                this.push({
                    type: "result",
                    jobId: job.jobId,
                    title: job.title,
                    status: result.status,
                    errorMessage: result.errorMessage,
                });
            } catch (err) {
                run.stats.failed++;
                this.push({
                    type: "result",
                    jobId: job.jobId,
                    title: job.title,
                    status: "FAILED",
                    errorMessage: err instanceof Error ? err.message : String(err),
                });
            }
        }

        if (signal.aborted) {
            run.status = "cancelled";
            run.finishedAt = new Date();
            this.push({ type: "cancelled" });
            return;
        }

        run.status = "done";
        run.finishedAt = new Date();
        this.push({ type: "done", stats: run.stats });
    }
}

export const runManager = new RunManager();

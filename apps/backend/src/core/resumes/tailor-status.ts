/**
 * Tracks which jobs are currently having a resume tailored.
 *
 * This is the single source of truth for "tailoring in progress", shared by the manual
 * POST /jobs/:id/tailor route and the background auto-tailor path. It lives in the backend
 * (not in component state) so the status survives closing and reopening the job modal, and so
 * a second tailor request for the same job joins the running one instead of starting a duplicate.
 *
 * In-memory by design: a tailoring run cannot outlive the process, so a restart correctly
 * reports nothing in flight.
 */
const inFlight = new Map<number, Promise<{ master: string }>>();

/** True while a tailoring run for this job is in progress. */
export function isTailoring(jobId: number): boolean {
    return inFlight.has(jobId);
}

/** Job ids currently being tailored. */
export function tailoringJobIds(): number[] {
    return [...inFlight.keys()];
}

/**
 * Runs `task` unless this job is already being tailored, in which case the caller joins the
 * in-flight run and receives its result. Guarantees at most one concurrent run per job.
 */
export function runTailoring(
    jobId: number,
    task: () => Promise<{ master: string }>,
): Promise<{ master: string }> {
    const existing = inFlight.get(jobId);
    if (existing) return existing;

    const started = task().finally(() => {
        inFlight.delete(jobId);
    });
    inFlight.set(jobId, started);
    return started;
}

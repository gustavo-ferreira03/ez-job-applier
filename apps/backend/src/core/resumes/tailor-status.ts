const inFlight = new Map<number, Promise<{ master: string }>>();

export function isTailoring(jobId: number): boolean {
    return inFlight.has(jobId);
}

export function tailoringJobIds(): number[] {
    return [...inFlight.keys()];
}

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

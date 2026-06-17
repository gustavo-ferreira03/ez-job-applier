let locked = false;
const waiters: Array<() => void> = [];

export function acquireVnc(): Promise<void> {
    if (!locked) {
        locked = true;
        return Promise.resolve();
    }
    return new Promise<void>((resolve) => waiters.push(resolve));
}

export function releaseVnc(): void {
    const next = waiters.shift();
    if (next) next();
    else locked = false;
}

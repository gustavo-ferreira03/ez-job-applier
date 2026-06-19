import crypto from "node:crypto";
import fs from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import type { BrowserContext } from "playwright-core";
import { openLoginContext, saveLinkedinSession, closeLinkedinContext } from "../../providers/linkedin/browser";
import { hasLinkedInSession } from "../../providers/linkedin/services/status";

const DISPLAY_START = 99;
const DISPLAY_END = 119;
const VNC_PORT_START = 5900;
export const SCREEN_WIDTH = 1280;
export const SCREEN_HEIGHT = 800;

export interface VncSession {
    id: string;
    display: string;
    port: number;
    kind: "login" | "linkedin" | "external-apply";
}

interface VncSessionRecord extends VncSession {
    xvfbProc: ChildProcess;
    x11vncProc: ChildProcess;
}

const sessions = new Map<string, VncSessionRecord>();

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

function run(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve) => {
        const proc = spawn(cmd, args, { stdio: "ignore" });
        proc.once("error", () => resolve());
        proc.once("exit", () => resolve());
    });
}

let staleCleanup: Promise<void> | null = null;

async function cleanupStaleVncProcesses(): Promise<void> {
    await run("pkill", ["-9", "-f", "x11vnc"]);
    await run("pkill", ["-9", "-f", "Xvfb"]);
    for (let display = DISPLAY_START; display <= DISPLAY_END; display += 1) {
        await fs.rm(`/tmp/.X${display}-lock`, { force: true }).catch(() => {});
        await fs.rm(`/tmp/.X11-unix/X${display}`, { force: true }).catch(() => {});
    }
    await sleep(1000);
}

function spawnWithOutput(cmd: string, args: string[], env = process.env): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"], env });
        let settled = false;
        let stderr = "";

        proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

        const timer = setTimeout(() => {
            settled = true;
            proc.off("error", onError);
            proc.off("exit", onExit);
            resolve(proc);
        }, 700);

        const onError = (error: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
        };

        const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            const reason = stderr.trim() || `${cmd} exited early: ${code ?? signal ?? "unknown"}`;
            reject(new Error(reason));
        };

        proc.once("error", onError);
        proc.once("exit", onExit);
    });
}

function publicSession(session: VncSessionRecord): VncSession {
    return { id: session.id, display: session.display, port: session.port, kind: session.kind };
}

export function getVncSession(id: string): VncSession | null {
    const session = sessions.get(id);
    return session ? publicSession(session) : null;
}

function x11Env(display: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, DISPLAY: display, XDG_SESSION_TYPE: "x11" };
    delete env.WAYLAND_DISPLAY;
    return env;
}

export async function startVncStack(kind: VncSession["kind"]): Promise<VncSession> {
    staleCleanup ??= cleanupStaleVncProcesses();
    await staleCleanup;
    let lastError: unknown;
    for (let display = DISPLAY_START; display <= DISPLAY_END; display += 1) {
        const displayName = `:${display}`;
        const port = VNC_PORT_START + (display - DISPLAY_START);
        if ([...sessions.values()].some((session) => session.display === displayName || session.port === port)) {
            continue;
        }
        let xvfbProc: ChildProcess | null = null;
        try {
            xvfbProc = await spawnWithOutput("Xvfb", [displayName, "-screen", "0", `${SCREEN_WIDTH}x${SCREEN_HEIGHT}x24`], x11Env(displayName));
            await sleep(1200);
            const x11vncProc = await spawnWithOutput("x11vnc", [
                "-display", displayName,
                "-localhost",
                "-rfbport", String(port),
                "-nopw", "-quiet", "-forever", "-noipv6", "-noshm",
            ], x11Env(displayName));
            const session: VncSessionRecord = {
                id: crypto.randomUUID(),
                display: displayName,
                port,
                kind,
                xvfbProc,
                x11vncProc,
            };
            sessions.set(session.id, session);
            await sleep(500);
            return publicSession(session);
        } catch (e) {
            lastError = e;
            xvfbProc?.kill("SIGKILL");
        }
    }
    throw lastError instanceof Error ? lastError : new Error("Xvfb/x11vnc failed to start");
}

export function stopVncStack(session: VncSession | string | null | undefined): void {
    if (!session) return;
    const id = typeof session === "string" ? session : session.id;
    const record = sessions.get(id);
    if (!record) return;
    record.x11vncProc.kill("SIGKILL");
    record.xvfbProc.kill("SIGKILL");
    sessions.delete(id);
    console.log(`[vnc] ${record.kind} session ${id} stopped`);
}

export async function openLoginBrowser(session: VncSession): Promise<BrowserContext> {
    const prev = process.env.DISPLAY;
    process.env.DISPLAY = session.display;
    try {
        return await openLoginContext();
    } finally {
        if (prev !== undefined) process.env.DISPLAY = prev;
        else delete process.env.DISPLAY;
    }
}

export async function waitForLogin(
    context: BrowserContext,
    shouldStop: () => boolean,
    intervalMs = 5_000,
): Promise<boolean> {
    const page = context.pages()[0];
    while (!shouldStop()) {
        const ok = await hasLinkedInSession(context, page).catch(() => false);
        if (ok) {
            await saveLinkedinSession(context);
            await closeLinkedinContext(context);
            return true;
        }
        await sleep(intervalMs);
    }
    await closeLinkedinContext(context).catch(() => undefined);
    return false;
}

import { spawn, type ChildProcess } from "node:child_process";
import type { BrowserContext } from "playwright-core";
import { openLoginContext, saveLinkedinSession, closeLinkedinContext } from "../../providers/linkedin/browser";
import { hasLinkedInSession } from "../../providers/linkedin/services/status";

const DISPLAY_START = 99;
const DISPLAY_END = 109;
export const VNC_PORT = 5900;

let xvfbProc: ChildProcess | null = null;
let x11vncProc: ChildProcess | null = null;
let activeDisplay = `:${DISPLAY_START}`;

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

function run(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve) => {
        const proc = spawn(cmd, args, { stdio: "ignore" });
        proc.once("error", () => resolve());
        proc.once("exit", () => resolve());
    });
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

export function getActiveDisplay(): string {
    return activeDisplay;
}

function x11Env(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, DISPLAY: activeDisplay, XDG_SESSION_TYPE: "x11" };
    delete env.WAYLAND_DISPLAY;
    return env;
}

export async function startVncStack(): Promise<void> {
    await stopStaleVncStack();
    let lastError: unknown;
    for (let display = DISPLAY_START; display <= DISPLAY_END; display += 1) {
        activeDisplay = `:${display}`;
        try {
            xvfbProc = await spawnWithOutput("Xvfb", [activeDisplay, "-screen", "0", "1280x800x24"], x11Env());
            break;
        } catch (e) {
            lastError = e;
            xvfbProc = null;
        }
    }
    if (!xvfbProc) throw lastError instanceof Error ? lastError : new Error("Xvfb failed to start");
    await sleep(1200);
    try {
        x11vncProc = await spawnWithOutput("x11vnc", [
            "-display", activeDisplay,
            "-localhost",
            "-rfbport", String(VNC_PORT),
            "-nopw", "-quiet", "-forever", "-noipv6",
        ], x11Env());
    } catch (e) {
        xvfbProc.kill();
        xvfbProc = null;
        throw e;
    }
    await sleep(500);
}

async function stopStaleVncStack(): Promise<void> {
    await run("pkill", ["-9", "-f", "x11vnc"]);
    await run("pkill", ["-9", "-f", "Xvfb"]);
    await sleep(1000);
}

export function stopVncStack(): void {
    x11vncProc?.kill("SIGKILL");
    xvfbProc?.kill("SIGKILL");
    x11vncProc = null;
    xvfbProc = null;
    console.log("[login] VNC stack stopped");
}

export async function openLoginBrowser(): Promise<BrowserContext> {
    const prev = process.env.DISPLAY;
    process.env.DISPLAY = activeDisplay;
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

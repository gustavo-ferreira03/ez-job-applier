import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { getActiveDisplay } from "../../login/vnc";
import { requestApproval } from "./state";

const execFileAsync = promisify(execFile);

export interface JobToolContext {
    jobId: number;
    workDir: string;
    session: string;
    aborted: boolean;
    approvedOnce: boolean;
    finishStatus: "submitted" | "aborted" | null;
    ensureVnc: () => Promise<void>;
}

function textResult(text: string) {
    return { content: [{ type: "text" as const, text }], details: undefined };
}

async function inlineSnapshots(stdout: string, workDir: string): Promise<string> {
    const match = stdout.match(/\[Snapshot\]\(([^)]+)\)/);
    if (!match) return stdout;
    try {
        const file = path.isAbsolute(match[1]) ? match[1] : path.join(workDir, match[1]);
        const snapshot = await fs.readFile(file, "utf8");
        return `${stdout}\n\nSnapshot:\n${snapshot}`;
    } catch {
        return stdout;
    }
}

export function createExternalApplyTools(jc: JobToolContext) {
    const browser = defineTool({
        name: "browser",
        label: "browser",
        description:
            "Drive the browser by running a playwright-cli command. `args` is the argument array, e.g. [\"open\", \"https://...\"], [\"snapshot\"], [\"click\", \"e15\"], [\"fill\", \"e7\", \"text\"], [\"upload\", \"/abs/file.pdf\"].",
        parameters: Type.Object({
            args: Type.Array(Type.String(), { description: "playwright-cli arguments" }),
        }),
        async execute(_id, params) {
            if (jc.aborted) {
                return textResult("This application was rejected by the user. Stop and call finish with status='aborted'.");
            }
            const userArgs = [...params.args];
            if (userArgs[0] === "open" && !userArgs.includes("--headed")) userArgs.push("--headed");
            const args = [`-s=${jc.session}`, ...userArgs];
            try {
                const { stdout, stderr } = await execFileAsync("playwright-cli", args, {
                    cwd: jc.workDir,
                    env: { ...process.env, DISPLAY: getActiveDisplay() },
                    timeout: 120_000,
                    maxBuffer: 8 * 1024 * 1024,
                });
                const out = await inlineSnapshots(`${stdout}${stderr ? `\n${stderr}` : ""}`.trim(), jc.workDir);
                return textResult(out || "(no output)");
            } catch (e) {
                const err = e as { stdout?: string; stderr?: string; message?: string };
                const detail = [err.stdout, err.stderr, err.message].filter(Boolean).join("\n").trim();
                return textResult(`playwright-cli failed:\n${detail || "unknown error"}`);
            }
        },
    });

    const request_approval = defineTool({
        name: "request_approval",
        label: "request_approval",
        description:
            "Pause and ask the user to review the browser before continuing. Call this at every important step and ALWAYS before the final submit. `summary` describes what you have done and what you are about to do.",
        parameters: Type.Object({
            summary: Type.String({ description: "What you did and what you are about to do next" }),
        }),
        async execute(_id, params) {
            await jc.ensureVnc();
            const decision = await requestApproval(params.summary);
            if (decision === "approve") {
                jc.approvedOnce = true;
                return textResult(
                    "APPROVED by the user. The user may have changed the page while in control — take a fresh [\"snapshot\"] before any further action.",
                );
            }
            jc.aborted = true;
            return textResult(
                "REJECTED by the user. Stop immediately: call finish with status='aborted' and perform no further browser actions.",
            );
        },
    });

    const finish = defineTool({
        name: "finish",
        label: "finish",
        description: "Signal that the application is complete ('submitted') or that you have stopped ('aborted').",
        parameters: Type.Object({
            status: Type.Union([Type.Literal("submitted"), Type.Literal("aborted")]),
        }),
        async execute(_id, params) {
            if (params.status === "submitted" && !jc.approvedOnce) {
                return textResult(
                    "You must call request_approval and receive approval before submitting. Request approval first.",
                );
            }
            jc.finishStatus = params.status;
            return textResult("Recorded.");
        },
    });

    return [browser, request_approval, finish];
}

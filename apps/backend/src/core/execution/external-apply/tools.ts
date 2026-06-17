import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { getActiveDisplay } from "../../login/vnc";
import { askUser, postAgentMessage } from "./state";

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

function textResult(text: string, terminate = false) {
    return { content: [{ type: "text" as const, text }], details: undefined, terminate };
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
            try {
                await jc.ensureVnc();
            } catch (e) {
                return textResult(`Could not start the browser display: ${String(e)}`);
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

    const say = defineTool({
        name: "say",
        label: "say",
        description:
            "Report progress to the user in the chat (non-blocking). Use a short sentence whenever you complete a meaningful step (page opened, a section filled, an obstacle found). Does not pause you.",
        parameters: Type.Object({
            message: Type.String({ description: "A short progress update for the user" }),
        }),
        async execute(_id, params) {
            postAgentMessage(params.message);
            return textResult("Posted.");
        },
    });

    const ask_user = defineTool({
        name: "ask_user",
        label: "ask_user",
        description:
            "Ask the user a question in the chat and wait for their reply. Use when you need information you don't have, are unsure how to proceed, or want confirmation. You MUST call this and get a go-ahead before clicking the final submit/apply button. Returns the user's reply.",
        parameters: Type.Object({
            question: Type.String({ description: "What you need from the user" }),
        }),
        async execute(_id, params) {
            await jc.ensureVnc();
            const resolution = await askUser(params.question);
            if (resolution.kind === "stop") {
                jc.aborted = true;
                return textResult(
                    "The user stopped this application. Call finish with status='aborted' and take no further actions.",
                    true,
                );
            }
            jc.approvedOnce = true;
            return textResult(`The user replied: ${resolution.text}`);
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
                    "You must use ask_user to get the user's go-ahead before submitting. Ask first.",
                );
            }
            jc.finishStatus = params.status;
            return textResult("Recorded.", true);
        },
    });

    return [browser, say, ask_user, finish];
}

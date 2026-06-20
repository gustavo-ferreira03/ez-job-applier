import path from "node:path";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { buildLaunchOptions } from "cloakbrowser";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "@earendil-works/pi-ai";
import { SCREEN_WIDTH, SCREEN_HEIGHT } from "../../login/vnc";
import type { BrowserStorageState } from "../../../providers/linkedin/browser";
import type { JobToolContext } from "./tools";

const require = createRequire(import.meta.url);
const MCP_CLI = path.join(path.dirname(require.resolve("@playwright/mcp/package.json")), "cli.js");

const ALLOWED_TOOLS = new Set([
    "browser_navigate",
    "browser_navigate_back",
    "browser_snapshot",
    "browser_click",
    "browser_type",
    "browser_fill_form",
    "browser_select_option",
    "browser_hover",
    "browser_press_key",
    "browser_file_upload",
    "browser_wait_for",
    "browser_handle_dialog",
    "browser_tabs",
]);

export interface BrowserMcp {
    client: Client;
    tools: { name: string; description?: string; inputSchema: unknown }[];
    fingerprintArgs: string[];
    close: () => Promise<void>;
}

export async function launchBrowserMcp(opts: {
    workDir: string;
    display: string;
    storageStatePath?: string;
    fingerprintArgs?: string[];
}): Promise<BrowserMcp> {
    const lo = await buildLaunchOptions({ locale: "pt-BR", args: opts.fingerprintArgs });
    const fingerprintArgs = (lo.args ?? []).filter((a) => a.startsWith("--fingerprint"));
    const config = {
        browser: {
            browserName: "chromium",
            launchOptions: {
                executablePath: lo.executablePath,
                headless: false,
                ignoreDefaultArgs: lo.ignoreDefaultArgs,
                args: [...(lo.args ?? []), "--disable-dev-shm-usage", "--window-position=0,0", `--window-size=${SCREEN_WIDTH},${SCREEN_HEIGHT}`],
            },
        },
    };
    const cfgPath = path.join(opts.workDir, "mcp-config.json");
    await fs.writeFile(cfgPath, JSON.stringify(config));

    const args = [MCP_CLI, "--config", cfgPath, "--isolated", "--caps", "storage"];
    if (opts.storageStatePath) {
        try {
            await fs.access(opts.storageStatePath);
            args.push("--storage-state", opts.storageStatePath);
        } catch {
            // no saved session yet — start fresh
        }
    }

    const transport = new StdioClientTransport({
        command: process.execPath,
        args,
        cwd: opts.workDir,
        env: { ...process.env, DISPLAY: opts.display } as Record<string, string>,
        stderr: "ignore",
    });
    const client = new Client({ name: "external-apply", version: "1.0.0" });
    await client.connect(transport);
    const { tools } = await client.listTools();
    return {
        client,
        tools: tools as BrowserMcp["tools"],
        fingerprintArgs,
        close: async () => {
            await client.close().catch(() => {});
        },
    };
}

export async function saveBrowserMcpStorageState(mcp: BrowserMcp, workDir: string): Promise<BrowserStorageState | null> {
    const statePath = path.join(workDir, "external-storage-state.json");
    try {
        await mcp.client.callTool({ name: "browser_storage_state", arguments: { filename: statePath } });
        return JSON.parse(await fs.readFile(statePath, "utf8")) as BrowserStorageState;
    } catch (e) {
        console.error("[external-apply] failed to save browser storage state:", e);
        return null;
    }
}

function inlineSnapshots(text: string, workDir: string): Promise<string> {
    const refs = [...text.matchAll(/\[Snapshot\]\(([^)]+)\)/g)].map((m) => m[1]);
    if (refs.length === 0) return Promise.resolve(text);
    return Promise.all(
        refs.map(async (ref) => {
            try {
                const file = path.isAbsolute(ref) ? ref : path.join(workDir, ref);
                return await fs.readFile(file, "utf8");
            } catch {
                return null;
            }
        }),
    ).then((snaps) => {
        const body = snaps.filter(Boolean).join("\n");
        return body ? `${text}\n\nSnapshot:\n${body}` : text;
    });
}

async function renderMcpResult(res: { content?: unknown }, workDir: string): Promise<string> {
    const content = Array.isArray(res.content) ? (res.content as { type?: string; text?: string }[]) : [];
    const text = content
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text)
        .join("\n")
        .trim();
    return inlineSnapshots(text, workDir);
}

function trackUrl(jc: JobToolContext, toolName: string, params: Record<string, unknown>, text: string): void {
    if (toolName === "browser_navigate" && typeof params.url === "string") {
        jc.lastUrl = params.url;
        return;
    }
    const match = text.match(/Page URL:\s*(\S+)/);
    if (match) jc.lastUrl = match[1];
}

export function bridgeBrowserTools(mcp: BrowserMcp, jc: JobToolContext) {
    return mcp.tools
        .filter((t) => ALLOWED_TOOLS.has(t.name))
        .map((t) =>
            defineTool({
                name: t.name,
                label: t.name,
                description: t.description ?? t.name,
                parameters: Type.Unsafe<Record<string, unknown>>(t.inputSchema as Parameters<typeof Type.Unsafe>[0]),
                async execute(_id, params) {
                    jc.toolCalls += 1;
                    if (jc.aborted) {
                        return {
                            content: [{ type: "text" as const, text: "This application was rejected by the user. Stop and call finish with status='aborted'." }],
                            details: undefined,
                            terminate: false,
                        };
                    }
                    if (!jc.browser) {
                        return { content: [{ type: "text" as const, text: "The browser is not ready yet. Wait and try again." }], details: undefined, terminate: false };
                    }
                    const args = (params ?? {}) as Record<string, unknown>;
                    try {
                        const res = await jc.browser.client.callTool({ name: t.name, arguments: args });
                        const text = await renderMcpResult(res as { content?: unknown }, jc.workDir);
                        trackUrl(jc, t.name, args, text);
                        return { content: [{ type: "text" as const, text: text || "(no output)" }], details: undefined, terminate: false };
                    } catch (e) {
                        return { content: [{ type: "text" as const, text: `browser tool failed: ${String(e)}` }], details: undefined, terminate: false };
                    }
                },
            }),
        );
}

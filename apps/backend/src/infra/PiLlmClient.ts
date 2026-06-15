import { complete, Type } from "@earendil-works/pi-ai";
import type { AssistantMessage, Context, TextContent, Tool, ToolCall } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { ZodType, z } from "zod/v4";
import type { ILlmClient } from "../core/llm/types";
import { getSettings } from "../repositories/settings";

function responseText(result: AssistantMessage): string {
    return result.content
        .filter((c): c is TextContent => c.type === "text")
        .map((c) => c.text)
        .join("\n")
        .trim();
}

function truncate(text: string, max = 600): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

export class PiLlmClient implements ILlmClient {
    constructor(private readonly modelRegistry: ModelRegistry) {}

    async generate<S extends ZodType>(
        params: { system: string; prompt: string; schema: S; label?: string },
        retryReason?: "tool_not_called" | "schema_invalid",
    ): Promise<z.infer<S>> {
        const label = params.label ?? "llm";
        const settings = await getSettings();
        const model = this.modelRegistry.find(settings.llm.provider, settings.llm.model);
        if (!model) {
            console.error(
                `[llm] ${label}: model not configured (provider=${settings.llm.provider}, model=${settings.llm.model})`,
            );
            throw new Error("LLM model not configured or provider not authenticated");
        }

        const auth = await this.modelRegistry.getApiKeyAndHeaders(model);
        if (!auth.ok) {
            console.error(`[llm] ${label}: auth failed for ${settings.llm.provider}: ${auth.error}`);
            throw new Error(auth.error ?? "LLM provider not authenticated");
        }

        const extractTool: Tool = {
            name: "extract",
            description: "Structured extraction",
            parameters: Type.Unsafe(params.schema.toJSONSchema() as any),
        };

        const retryPrefix =
            retryReason === "tool_not_called"
                ? "You MUST call the 'extract' tool. Use empty string for any field you cannot determine. Do not respond with plain text.\n\n"
                : retryReason === "schema_invalid"
                ? "Previous attempt had invalid output. Please call the 'extract' tool again with correct values.\n\n"
                : "";

        const userText = `${retryPrefix}${params.system}\n\n${params.prompt}`;

        const ctx: Context = {
            messages: [
                {
                    role: "user",
                    content: [{ type: "text", text: userText }],
                    timestamp: Date.now(),
                },
            ],
            tools: [extractTool],
        };

        const tag = `${settings.llm.provider}/${settings.llm.model}${retryReason ? ` (retry: ${retryReason})` : ""}`;
        const startedAt = Date.now();

        let result: AssistantMessage;
        try {
            result = await complete(model, ctx, {
                apiKey: auth.apiKey,
                headers: auth.headers ?? {},
                tool_choice: { type: "tool", name: "extract" },
            });
        } catch (err) {
            console.error(`[llm] ${label} ${tag}: request error after ${Date.now() - startedAt}ms:`, err);
            throw err;
        }

        const ms = Date.now() - startedAt;
        const toolCall = result.content.find(
            (c): c is ToolCall => c.type === "toolCall" && c.name === "extract",
        );

        if (!toolCall) {
            const detail = result.errorMessage ?? truncate(responseText(result)) ?? "";
            console.warn(
                `[llm] ${label} ${tag}: no tool call — stop=${result.stopReason}, ${result.usage.totalTokens} tok, ${ms}ms${detail ? ` — ${detail}` : " — (empty response)"}`,
            );
            if (!retryReason) return this.generate(params, "tool_not_called");
            throw new Error(
                `LLM did not return structured output [${label}, ${tag}, stop=${result.stopReason}]: ${detail || "(empty response)"}`,
            );
        }

        const parsed = params.schema.safeParse(toolCall.arguments);
        if (!parsed.success) {
            console.warn(
                `[llm] ${label} ${tag}: invalid output (${ms}ms) — ${parsed.error.message} — args: ${truncate(JSON.stringify(toolCall.arguments))}`,
            );
            if (!retryReason) return this.generate(params, "schema_invalid");
            throw new Error(`LLM output failed schema validation [${label}]: ${parsed.error.message}`);
        }

        console.log(
            `[llm] ${label} ${tag}: ok — ${result.usage.totalTokens} tok ($${result.usage.cost.total.toFixed(4)}), ${ms}ms`,
        );
        return parsed.data;
    }
}

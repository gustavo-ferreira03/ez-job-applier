import { complete, Type } from "@earendil-works/pi-ai";
import type { Context, Tool, ToolCall } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { ZodType, z } from "zod/v4";
import type { ILlmClient } from "../core/llm/types";
import { getSettings } from "../repositories/settings";

export class PiLlmClient implements ILlmClient {
    constructor(private readonly modelRegistry: ModelRegistry) {}

    async generate<S extends ZodType>(
        params: { system: string; prompt: string; schema: S },
        retryReason?: "tool_not_called" | "schema_invalid",
    ): Promise<z.infer<S>> {
        const settings = await getSettings();
        const model = this.modelRegistry.find(settings.llm.provider, settings.llm.model);
        if (!model) {
            throw new Error("LLM model not configured or provider not authenticated");
        }

        const auth = await this.modelRegistry.getApiKeyAndHeaders(model);
        if (!auth.ok) {
            throw new Error(auth.error);
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

        const result = await complete(model, ctx, {
            apiKey: auth.apiKey,
            headers: auth.headers ?? {},
            tool_choice: { type: "tool", name: "extract" },
        });

        const toolCall = result.content.find(
            (c): c is ToolCall => c.type === "toolCall" && c.name === "extract",
        );

        if (!toolCall) {
            if (!retryReason) return this.generate(params, "tool_not_called");
            throw new Error("LLM did not call the extract tool after retry");
        }

        const parsed = params.schema.safeParse(toolCall.arguments);
        if (!parsed.success) {
            if (!retryReason) return this.generate(params, "schema_invalid");
            throw new Error(`LLM extraction schema validation failed: ${parsed.error.message}`);
        }

        return parsed.data;
    }
}

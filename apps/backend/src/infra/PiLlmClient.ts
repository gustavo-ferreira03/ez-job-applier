import { complete, Type } from "@earendil-works/pi-ai";
import type { Context, Tool, ToolCall } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { ZodType, z } from "zod/v4";
import type { ILlmClient } from "../core/llm/types";
import { getSettings } from "../repositories/settings";

export class PiLlmClient implements ILlmClient {
    constructor(private readonly modelRegistry: ModelRegistry) {}

    async extract<S extends ZodType>(params: {
        system: string;
        prompt: string;
        schema: S;
    }): Promise<z.infer<S>> {
        return this.doExtract(params, false);
    }

    private async doExtract<S extends ZodType>(
        params: { system: string; prompt: string; schema: S },
        isRetry: boolean,
    ): Promise<z.infer<S>> {
        const settings = await getSettings();
        const found = this.modelRegistry.find(settings.llm.provider, settings.llm.model);
        if (!found) {
            throw new Error("LLM model not configured or provider not authenticated");
        }

        const auth = await this.modelRegistry.getApiKeyAndHeaders(found);
        if (!auth.ok) {
            throw new Error(auth.error);
        }

        const extractTool: Tool = {
            name: "extract",
            description: "Structured extraction",
            parameters: Type.Unsafe(params.schema.toJSONSchema() as any),
        };

        const userText = isRetry
            ? `Previous extraction failed validation. Please try again.\n\n${params.system}\n\n${params.prompt}`
            : `${params.system}\n\n${params.prompt}`;

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

        const result = await complete(found, ctx, {
            apiKey: auth.apiKey,
            headers: auth.headers ?? {},
            tool_choice: { type: "tool", name: "extract" },
        });

        const toolCall = result.content.find(
            (c): c is ToolCall => c.type === "toolCall" && c.name === "extract",
        );

        if (!toolCall) {
            if (!isRetry) {
                return this.doExtract(params, true);
            }
            throw new Error("LLM did not call the extract tool after retry");
        }

        const parsed = params.schema.safeParse(toolCall.arguments);
        if (!parsed.success) {
            if (!isRetry) {
                return this.doExtract(params, true);
            }
            throw new Error(`LLM extraction schema validation failed: ${parsed.error.message}`);
        }

        return parsed.data;
    }
}

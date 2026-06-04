import type { ILlmClient } from "../core/llm/types";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { ZodType, z } from "zod/v4";

export class PiLlmClient implements ILlmClient {
    constructor(private readonly modelRegistry: ModelRegistry) {}

    async extract<S extends ZodType>(_params: {
        system: string;
        prompt: string;
        schema: S;
    }): Promise<z.infer<S>> {
        throw new Error("Not implemented");
    }
}

import type { ZodType, z } from "zod/v4";

export interface ILlmClient {
    generate<S extends ZodType>(params: {
        system: string;
        prompt: string;
        schema: S;
        label?: string;
    }): Promise<z.infer<S>>;
}

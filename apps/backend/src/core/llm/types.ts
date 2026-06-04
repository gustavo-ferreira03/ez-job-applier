import type { ZodType, z } from "zod/v4";

export interface ILlmClient {
    extract<S extends ZodType>(params: {
        system: string;
        prompt: string;
        schema: S;
    }): Promise<z.infer<S>>;
}

import type { ApplicationQuestion } from "../../core/types";
import { OPTION_PLACEHOLDERS } from "./format";

export type AnswerValidation = { ok: true; value: string } | { ok: false; hint: string };

function options(question: ApplicationQuestion): string[] {
    return (question.options ?? []).filter((o) => !OPTION_PLACEHOLDERS.includes(o));
}

export function validateAnswer(question: ApplicationQuestion | undefined, raw: string): AnswerValidation {
    const value = raw.trim();
    if (!value) return { ok: false, hint: "cannot be empty" };
    if (!question) return { ok: true, value };

    if (question.fieldType === "number") {
        if (!/^\d+(\.\d+)?$/.test(value)) return { ok: false, hint: "must be a number" };
        return { ok: true, value };
    }

    const opts = options(question);
    const isChoice = question.fieldType === "select" || question.fieldType === "radio" || question.fieldType === "checkbox";
    if (isChoice && opts.length) {
        const match = (input: string): string | undefined => opts.find((o) => o.toLowerCase() === input.trim().toLowerCase());
        if (question.fieldType === "checkbox") {
            const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
            const matched = parts.map(match);
            if (parts.length === 0 || matched.some((m) => m === undefined)) {
                return { ok: false, hint: `choose from: ${opts.join(" | ")}` };
            }
            return { ok: true, value: (matched as string[]).join(", ") };
        }
        const single = match(value);
        if (!single) return { ok: false, hint: `choose from: ${opts.join(" | ")}` };
        return { ok: true, value: single };
    }

    return { ok: true, value };
}

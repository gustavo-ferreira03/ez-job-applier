import fs from "node:fs/promises";
import path from "node:path";
import { sessionFilePath } from "../../../providers/linkedin/browser";

const MEMORY_FILE = path.join(path.dirname(sessionFilePath), "agent-memory.json");

export interface AgentMemory {
    question: string;
    answer: string;
}

let writeChain: Promise<void> = Promise.resolve();

function normalize(question: string): string {
    return question.trim().toLowerCase();
}

export async function loadAgentMemory(): Promise<AgentMemory[]> {
    try {
        const parsed = JSON.parse(await fs.readFile(MEMORY_FILE, "utf8")) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
            (m): m is AgentMemory =>
                !!m && typeof m.question === "string" && typeof m.answer === "string" && m.question.trim() !== "" && m.answer.trim() !== "",
        );
    } catch {
        return [];
    }
}

export function formatAgentMemory(memories: AgentMemory[]): string {
    if (memories.length === 0) return "";
    const lines = memories.map((m) => `- ${m.question.trim()} → ${m.answer.trim()}`);
    return ["## Known answers from past applications (reuse these; never ask the user again for them)", ...lines].join("\n");
}

export function rememberAgentFact(question: string, answer: string): Promise<void> {
    const q = question.trim();
    const a = answer.trim();
    if (!q || !a) return writeChain;
    writeChain = writeChain
        .then(async () => {
            const memories = await loadAgentMemory();
            const key = normalize(q);
            const existing = memories.find((m) => normalize(m.question) === key);
            if (existing) {
                existing.question = q;
                existing.answer = a;
            } else {
                memories.push({ question: q, answer: a });
            }
            await fs.mkdir(path.dirname(MEMORY_FILE), { recursive: true });
            await fs.writeFile(MEMORY_FILE, JSON.stringify(memories, null, 2));
        })
        .catch((e) => {
            console.error("[external-apply] failed to write agent memory:", e);
        });
    return writeChain;
}

import path from "node:path";
import fs from "node:fs/promises";

const AUTH_PATH = path.resolve("storage/github-auth.json");

export async function readGithubToken(): Promise<string | null> {
    try {
        const raw = await fs.readFile(AUTH_PATH, "utf8");
        return (JSON.parse(raw) as { token?: string }).token ?? null;
    } catch {
        return null;
    }
}

export async function writeGithubToken(token: string): Promise<void> {
    await fs.mkdir(path.dirname(AUTH_PATH), { recursive: true });
    await fs.writeFile(AUTH_PATH, JSON.stringify({ token }), "utf8");
}

export async function clearGithubToken(): Promise<void> {
    await fs.rm(AUTH_PATH, { force: true });
}

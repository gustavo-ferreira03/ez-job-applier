import { OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getSettings, updateSettings } from "../repositories/settings";
import { readGithubToken, writeGithubToken, clearGithubToken } from "../repositories/github-auth";
import { githubClient } from "../infra/GithubClient";
import { syncGithubRepo } from "../core/resumes/github-sync";
import type { AppContext } from "../core/context";

const pendingStates = new Map<string, { expires: number; returnTo: string }>();

function rememberState(state: string, returnTo: string): void {
    pendingStates.set(state, { expires: Date.now() + 10 * 60 * 1000, returnTo });
}

function consumeState(state: string): string | null {
    const entry = pendingStates.get(state);
    pendingStates.delete(state);
    return entry && entry.expires > Date.now() ? entry.returnTo : null;
}

export function createGithubRouter(ctx: AppContext) {
    const router = new OpenAPIHono();

    router.get("/auth/github/start", (c) => {
        const clientId = process.env.GITHUB_CLIENT_ID;
        if (!clientId) throw new HTTPException(500, { message: "GITHUB_CLIENT_ID not configured" });
        const origin = new URL(c.req.url).origin;
        const returnTo = c.req.header("referer") ?? "/";
        const state = crypto.randomUUID();
        rememberState(state, returnTo);
        const url = new URL("https://github.com/login/oauth/authorize");
        url.searchParams.set("client_id", clientId);
        url.searchParams.set("redirect_uri", `${origin}/auth/github/callback`);
        url.searchParams.set("scope", "repo");
        url.searchParams.set("state", state);
        return c.redirect(url.toString());
    });

    router.get("/auth/github/callback", async (c) => {
        const code = c.req.query("code");
        const state = c.req.query("state");
        const returnTo = state ? consumeState(state) : null;
        if (!code || !returnTo) {
            throw new HTTPException(400, { message: "Invalid OAuth callback" });
        }
        try {
            const token = await githubClient.exchangeCodeForToken(code);
            const login = await githubClient.getLogin(token);
            await writeGithubToken(token);
            const settings = await getSettings();
            await updateSettings({
                advanced: { github: { ...settings.advanced.github, connected: true, login } },
            });
        } catch (e) {
            throw new HTTPException(502, { message: `GitHub authorization failed: ${String(e)}` });
        }
        return c.redirect(returnTo);
    });

    router.post("/github/disconnect", async (c) => {
        await clearGithubToken();
        const settings = await getSettings();
        await updateSettings({
            advanced: {
                github: { connected: false, login: null, repo: settings.advanced.github.repo, lastSyncedAt: settings.advanced.github.lastSyncedAt, masters: settings.advanced.github.masters },
            },
        });
        return c.json({ ok: true });
    });

    router.get("/github/repos", async (c) => {
        const token = await readGithubToken();
        if (!token) throw new HTTPException(401, { message: "GitHub not connected" });
        return c.json({ repos: await githubClient.listRepos(token) });
    });

    router.post("/github/sync", async (c) => {
        const { repo } = await c.req.json<{ repo?: string }>();
        if (!repo) throw new HTTPException(400, { message: "repo is required" });
        try {
            const masters = await syncGithubRepo(ctx, repo);
            return c.json({ ok: true, masters });
        } catch (e) {
            throw new HTTPException(502, { message: String(e instanceof Error ? e.message : e) });
        }
    });

    return router;
}

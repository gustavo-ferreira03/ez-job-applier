import { OpenAPIHono } from "@hono/zod-openapi";
import {
    loginAnthropic,
    loginOpenAICodexDeviceCode,
    loginGitHubCopilot,
    getOAuthProviders,
    type OAuthCredentials,
    type OAuthDeviceCodeInfo,
} from "@earendil-works/pi-ai/oauth";
import { getSettings, updateSettings, type LlmSettings } from "../repositories/settings";
import type { AppContext } from "../core/context";

type OAuthState = {
    status: "pending" | "done" | "error";
    url?: string;
    userCode?: string;
    verificationUri?: string;
    error?: string;
};

type ProviderInfo = {
    id: string;
    name: string;
    configured: boolean;
    authMethods: ("oauth" | "api_key")[];
    models: { id: string; label: string }[];
};

const oauthSessions = new Map<string, OAuthState>();

function formatProviderName(id: string): string {
    return id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function createSettingsRouter(ctx: AppContext) {
    const router = new OpenAPIHono();

    router.get("/settings", async (c) => c.json(await getSettings()));

    router.patch("/settings", async (c) => {
        const body = await c.req.json();
        const updated = await updateSettings(body);
        return c.json(updated);
    });

    router.get("/settings/llm", async (c) => {
        const settings = await getSettings();

        const oauthProviders = getOAuthProviders();
        const oauthIds = new Set(oauthProviders.map((p) => p.id));
        const oauthNames = new Map(oauthProviders.map((p) => [p.id, p.name]));

        const allModels = ctx.modelRegistry.getAll();
        const modelsByProvider = new Map<string, { id: string; label: string }[]>();
        for (const m of allModels) {
            if (!modelsByProvider.has(m.provider)) modelsByProvider.set(m.provider, []);
            modelsByProvider.get(m.provider)!.push({ id: m.id, label: m.name ?? m.id });
        }

        const providers: ProviderInfo[] = [...modelsByProvider.entries()]
            .map(([id, models]) => ({
                id,
                name: oauthNames.get(id) ?? formatProviderName(id),
                configured: ctx.llmAuth.hasAuth(id),
                authMethods: oauthIds.has(id)
                    ? (["oauth", "api_key"] as ("oauth" | "api_key")[])
                    : (["api_key"] as ("oauth" | "api_key")[]),
                models,
            }))
            .sort((a, b) => {
                if (a.configured !== b.configured) return a.configured ? -1 : 1;
                const aOAuth = a.authMethods.includes("oauth" as "oauth" | "api_key");
                const bOAuth = b.authMethods.includes("oauth" as "oauth" | "api_key");
                if (aOAuth !== bOAuth) return aOAuth ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

        return c.json({ providers, current: settings.llm });
    });

    router.put("/settings/llm/providers/:provider", async (c) => {
        const provider = c.req.param("provider");
        const body = await c.req.json<{ apiKey: string }>();
        if (!body.apiKey) {
            return c.json({ error: "apiKey is required" }, 400);
        }
        ctx.llmAuth.set(provider, { type: "api_key", key: body.apiKey });
        ctx.llmAuth.setRuntimeApiKey(provider, body.apiKey);
        return c.json({ ok: true });
    });

    router.delete("/settings/llm/providers/:provider", async (c) => {
        const provider = c.req.param("provider");
        ctx.llmAuth.remove(provider);
        return c.json({ ok: true });
    });

    router.patch("/settings/llm", async (c) => {
        const body = await c.req.json<Partial<LlmSettings>>();
        const settings = await getSettings();
        const updated = await updateSettings({ llm: { ...settings.llm, ...body } });
        return c.json(updated.llm);
    });

    router.post("/settings/llm/providers/:provider/oauth/start", async (c) => {
        const provider = c.req.param("provider");

        const id = crypto.randomUUID();
        oauthSessions.set(id, { status: "pending" });

        if (provider === "anthropic") {
            loginAnthropic({
                onAuth: ({ url }: { url: string; instructions?: string }) => {
                    oauthSessions.set(id, { status: "pending", url });
                },
                onPrompt: async () => "",
            })
                .then((credentials: OAuthCredentials) => {
                    ctx.llmAuth.set(provider, { type: "oauth", ...credentials });
                    oauthSessions.set(id, { status: "done" });
                })
                .catch((e: Error) => {
                    oauthSessions.set(id, { status: "error", error: e.message });
                });
            return c.json({ sessionId: id, type: "browser" });
        }

        if (provider === "openai-codex") {
            loginOpenAICodexDeviceCode({
                onDeviceCode: ({ userCode, verificationUri }: OAuthDeviceCodeInfo) => {
                    oauthSessions.set(id, { status: "pending", userCode, verificationUri });
                },
            })
                .then((credentials: OAuthCredentials) => {
                    ctx.llmAuth.set(provider, { type: "oauth", ...credentials });
                    oauthSessions.set(id, { status: "done" });
                })
                .catch((e: Error) => {
                    oauthSessions.set(id, { status: "error", error: e.message });
                });
            return c.json({ sessionId: id, type: "device_code" });
        }

        if (provider === "github-copilot") {
            loginGitHubCopilot({
                onDeviceCode: ({ userCode, verificationUri }: OAuthDeviceCodeInfo) => {
                    oauthSessions.set(id, { status: "pending", userCode, verificationUri });
                },
                onPrompt: async () => "",
            })
                .then((credentials: OAuthCredentials) => {
                    ctx.llmAuth.set(provider, { type: "oauth", ...credentials });
                    oauthSessions.set(id, { status: "done" });
                })
                .catch((e: Error) => {
                    oauthSessions.set(id, { status: "error", error: e.message });
                });
            return c.json({ sessionId: id, type: "device_code" });
        }

        oauthSessions.delete(id);
        return c.json({ error: "OAuth not supported for this provider" }, 400);
    });

    router.get("/settings/llm/providers/:provider/oauth/poll", async (c) => {
        const sessionId = c.req.query("sessionId");
        if (!sessionId) {
            return c.json({ error: "Missing sessionId" }, 400);
        }
        const session = oauthSessions.get(sessionId);
        if (!session) {
            return c.json({ error: "Session not found" }, 404);
        }
        if (session.status === "done" || session.status === "error") {
            oauthSessions.delete(sessionId);
        }
        return c.json(session);
    });

    return router;
}

import { OpenAPIHono } from "@hono/zod-openapi";
import { loginAnthropic, loginOpenAICodexDeviceCode, type OAuthCredentials, type OAuthDeviceCodeInfo } from "@earendil-works/pi-ai/oauth";
import { getSettings, updateSettings, type LlmSettings } from "../repositories/settings";
import type { AppContext } from "../core/context";

type OAuthState = {
    status: "pending" | "done" | "error";
    url?: string;
    userCode?: string;
    verificationUri?: string;
    error?: string;
};

const oauthSessions = new Map<string, OAuthState>();

const KNOWN_PROVIDERS = ["anthropic", "openai-codex"] as const;
type KnownProvider = (typeof KNOWN_PROVIDERS)[number];

function isKnownProvider(p: string): p is KnownProvider {
    return (KNOWN_PROVIDERS as readonly string[]).includes(p);
}

export function createSettingsRouter(ctx: AppContext) {
    const router = new OpenAPIHono();

    router.get("/settings", async (c) => c.json(await getSettings()));

    router.patch("/settings", async (c) => {
        const body = await c.req.json<{ browserVisible?: boolean }>();
        const updated = await updateSettings(body);
        return c.json(updated);
    });

    router.get("/settings/llm", async (c) => {
        const settings = await getSettings();

        const providers: Record<string, { configured: boolean }> = {};
        for (const p of KNOWN_PROVIDERS) {
            providers[p] = { configured: ctx.llmAuth.hasAuth(p) };
        }

        const available = ctx.modelRegistry.getAvailable().map((m) => ({
            provider: m.provider,
            id: m.id,
            label: m.name ?? m.id,
        }));

        return c.json({ providers, available, current: settings.llm });
    });

    router.put("/settings/llm/providers/:provider", async (c) => {
        const provider = c.req.param("provider");
        if (!isKnownProvider(provider)) {
            return c.json({ error: "Unknown provider" }, 400);
        }
        const body = await c.req.json<{ apiKey: string }>();
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
        if (!isKnownProvider(provider)) {
            return c.json({ error: "Unknown provider" }, 400);
        }

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
                    ctx.llmAuth.set("anthropic", { type: "oauth", ...credentials });
                    oauthSessions.set(id, { status: "done" });
                })
                .catch((e: Error) => {
                    oauthSessions.set(id, { status: "error", error: e.message });
                });
            return c.json({ sessionId: id, type: "browser" });
        }

        loginOpenAICodexDeviceCode({
            onDeviceCode: ({ userCode, verificationUri }: OAuthDeviceCodeInfo) => {
                oauthSessions.set(id, { status: "pending", userCode, verificationUri });
            },
        })
            .then((credentials: OAuthCredentials) => {
                ctx.llmAuth.set("openai-codex", { type: "oauth", ...credentials });
                oauthSessions.set(id, { status: "done" });
            })
            .catch((e: Error) => {
                oauthSessions.set(id, { status: "error", error: e.message });
            });
        return c.json({ sessionId: id, type: "device_code" });
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

import crypto from "node:crypto";
import type { AppContext } from "../../core/context";
import { getSettings, updateSettings } from "../../repositories/settings";
import { applicationStatusChanged, agentAttention, type AgentAttention } from "../../core/events";
import { sendUserMessage, stopExternalApply } from "../../core/execution/external-apply/state";
import { applyToJob } from "../../core/applications/apply";
import { rejectJob } from "../../core/applications/reject";
import { saveAnswers } from "../../core/applications/answer";
import { TelegramBot, type TelegramHandlers } from "./bot";
import { parseNumberedReply } from "./parse";
import { formatEasyApplyForm, formatEasyApplyReview, formatAgentMessage, OPTION_PLACEHOLDERS } from "./format";
import { validateAnswer } from "./validate";
import { rememberPending, lookupPending, forgetPending, markStatus, type PendingAction } from "./pending";

let botRef: TelegramBot | null = null;
let chatIdRef: number | null = null;
let tokenRef: string | null = null;
let ctxRef: AppContext | null = null;
let subscribed = false;

const STALE = "This request is no longer available.";

function authed(chatId: number): boolean {
    return chatIdRef !== null && chatId === chatIdRef;
}

async function notifyEasyApply(ctx: AppContext, jobId: number, status: "NEEDS_INPUT" | "READY_FOR_REVIEW"): Promise<void> {
    if (!botRef || chatIdRef === null) return;
    const job = await ctx.jobRepo.getById(jobId);
    if (!job || job.applicationUrl != null) return;
    const application = await ctx.appRepo.get(job.provider, job.jobId);
    if (!application) return;
    const questions = await ctx.appRepo.getQuestions(application.id);

    if (status === "NEEDS_INPUT") {
        const unanswered = questions.filter((q) => !q.answer?.trim());
        const labels = unanswered.map((q) => q.label);
        const messageId = await botRef.send(chatIdRef, formatEasyApplyForm(job, unanswered));
        rememberPending(messageId, { kind: "easyapply-form", jobId, labels });
        return;
    }

    const messageId = await botRef.send(chatIdRef, formatEasyApplyReview(job, questions), [
        { label: "Submit", data: `submit:${jobId}` },
        { label: "Reject", data: `reject:${jobId}` },
    ]);
    rememberPending(messageId, { kind: "easyapply-review", jobId });
}

async function notifyAgent(payload: AgentAttention): Promise<void> {
    if (!botRef || chatIdRef === null) return;
    const job = await ctxRef?.jobRepo.getById(payload.jobId);
    if (!job) return;
    const text = formatAgentMessage(job, payload.question, payload.phase);
    const buttons = payload.phase === "review"
        ? [
            { label: "Submit", data: `submit:${payload.jobId}` },
            { label: "Reject", data: `reject:${payload.jobId}` },
        ]
        : undefined;
    const kind = payload.phase === "review" ? "agent-review" : "agent-ask";

    if (payload.screenshotPath) {
        try {
            const messageId = await botRef.sendPhoto(chatIdRef, payload.screenshotPath, text, buttons);
            rememberPending(messageId, { kind, jobId: payload.jobId });
            return;
        } catch (e) {
            console.error("[telegram] screenshot message failed:", e);
        }
    }

    if (payload.phase === "review") {
        const messageId = await botRef.send(chatIdRef, text, buttons);
        rememberPending(messageId, { kind: "agent-review", jobId: payload.jobId });
    } else {
        const messageId = await botRef.send(chatIdRef, text);
        rememberPending(messageId, { kind: "agent-ask", jobId: payload.jobId });
    }
}

function subscribeOnce(): void {
    if (subscribed) return;
    subscribed = true;

    applicationStatusChanged.on(({ jobId, status }) => {
        if (status !== "NEEDS_INPUT" && status !== "READY_FOR_REVIEW") {
            markStatus(jobId, status);
            return;
        }
        if (!markStatus(jobId, status)) return;
        if (!ctxRef) return;
        void notifyEasyApply(ctxRef, jobId, status).catch((e) => console.error("[telegram] notify easy-apply failed:", e));
    });

    agentAttention.on((payload) => {
        void notifyAgent(payload).catch((e) => console.error("[telegram] notify agent failed:", e));
    });
}

async function handleEasyApplyForm(ctx: AppContext, action: Extract<PendingAction, { kind: "easyapply-form" }>, text: string): Promise<string> {
    const job = await ctx.jobRepo.getById(action.jobId);
    const application = job ? await ctx.appRepo.get(job.provider, job.jobId) : null;
    if (!application) return STALE;
    const questions = await ctx.appRepo.getQuestions(application.id);
    const byLabel = new Map(questions.map((q) => [q.label, q] as const));

    const parsed = parseNumberedReply(text);
    const candidates: [string, string][] = [];
    if (parsed.size === 0 && action.labels.length === 1) {
        candidates.push([action.labels[0], text.trim()]);
    } else {
        for (const [index, value] of parsed) {
            const label = action.labels[index - 1];
            if (label) candidates.push([label, value]);
        }
    }
    if (candidates.length === 0) {
        return "I couldn't read any numbered answers. Reply like: 1) answer one  2) answer two";
    }

    const answers: Record<string, string> = {};
    const rejected: string[] = [];
    for (const [label, value] of candidates) {
        const result = validateAnswer(byLabel.get(label), value);
        if (result.ok) answers[label] = result.value;
        else rejected.push(`- ${label}: ${result.hint}`);
    }
    if (Object.keys(answers).length) await saveAnswers(action.jobId, answers, ctx);

    const unanswered = (await ctx.appRepo.getQuestions(application.id)).filter((q) => !q.answer?.trim());
    if (unanswered.length === 0 && rejected.length === 0) {
        return "Saved. All questions answered.";
    }
    const lines = ["Saved what I could. Still needed, numbered:"];
    unanswered.forEach((q, index) => {
        const opts = (q.options ?? []).filter((o) => !OPTION_PLACEHOLDERS.includes(o));
        lines.push(`${index + 1}) ${q.label}${opts.length ? ` — options: ${opts.join(" | ")}` : ""}`);
    });
    if (rejected.length) lines.push("", "Rejected:", ...rejected);
    return lines.join("\n");
}

function buildHandlers(ctx: AppContext): TelegramHandlers {
    return {
        async onStart(code, chatId) {
            const settings = await getSettings();
            const tg = settings.advanced.telegram;
            const expiresAt = tg.pairingExpiresAt ? Date.parse(tg.pairingExpiresAt) : 0;
            const expired = !expiresAt || expiresAt < Date.now();
            if (!tg.pairingCode || code.toLowerCase() !== tg.pairingCode.toLowerCase() || expired) {
                if (botRef) await botRef.sendPlain(chatId, "Invalid or expired pairing code.");
                return;
            }
            await updateSettings({
                advanced: {
                    ...settings.advanced,
                    telegram: { ...tg, chatId: String(chatId), pairingCode: null, pairingExpiresAt: null },
                },
            });
            chatIdRef = chatId;
            if (botRef) await botRef.sendPlain(chatId, "Paired. You'll get application alerts here.");
        },

        async onReply(replyToMessageId, text, chatId) {
            if (!authed(chatId) || !botRef) return;
            const action = lookupPending(replyToMessageId);
            if (!action) {
                await botRef.sendPlain(chatId, STALE, replyToMessageId);
                return;
            }
            if (action.kind === "easyapply-form") {
                const reply = await handleEasyApplyForm(ctx, action, text);
                if (reply === "Saved. All questions answered.") forgetPending(replyToMessageId);
                await botRef.sendPlain(chatId, reply, replyToMessageId);
                return;
            }
            if (action.kind === "agent-ask" || action.kind === "agent-review") {
                const ok = await sendUserMessage(action.jobId, text);
                if (ok) forgetPending(replyToMessageId);
                await botRef.sendPlain(chatId, ok ? "Sent to the agent." : STALE, replyToMessageId);
                return;
            }
            await botRef.sendPlain(chatId, "Use the Submit/Reject buttons for this one.", replyToMessageId);
        },

        async onCallback(data, messageId, chatId) {
            if (!authed(chatId) || !botRef) return;
            const action = lookupPending(messageId);
            if (!action) {
                await botRef.sendPlain(chatId, STALE);
                return;
            }
            const [verb] = data.split(":");
            if (action.kind === "easyapply-review") {
                if (verb === "submit") {
                    try {
                        await applyToJob(action.jobId, {}, ctx);
                    } catch (e) {
                        await botRef.sendPlain(chatId, `Couldn't submit: ${e instanceof Error ? e.message : String(e)}`);
                        return;
                    }
                    await botRef.sendPlain(chatId, "Submitted.");
                } else {
                    await rejectJob(action.jobId, ctx);
                    await botRef.sendPlain(chatId, "Rejected.");
                }
                forgetPending(messageId);
                return;
            }
            if (action.kind === "agent-review") {
                const ok = verb === "submit"
                    ? await sendUserMessage(action.jobId, "Yes, go ahead and submit.")
                    : stopExternalApply(action.jobId);
                await botRef.sendPlain(chatId, ok ? (verb === "submit" ? "Approved." : "Stopped.") : STALE);
                forgetPending(messageId);
                return;
            }
            await botRef.sendPlain(chatId, "Reply to that message with your answer instead.");
        },
    };
}

export async function startPairing(): Promise<string> {
    const settings = await getSettings();
    const code = crypto.randomBytes(3).toString("hex");
    await updateSettings({
        advanced: {
            ...settings.advanced,
            telegram: {
                ...settings.advanced.telegram,
                pairingCode: code,
                pairingExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
            },
        },
    });
    return code;
}

export async function getPairingStatus(): Promise<{ paired: boolean; hasToken: boolean; enabled: boolean }> {
    const settings = await getSettings();
    const tg = settings.advanced.telegram;
    return { paired: tg.chatId != null, hasToken: tg.botToken.length > 0, enabled: tg.enabled };
}

async function renotifyPending(ctx: AppContext): Promise<void> {
    if (!botRef || chatIdRef === null) return;
    for (const status of ["NEEDS_INPUT", "READY_FOR_REVIEW"] as const) {
        const jobIds = await ctx.appRepo.listIdsByStatus(status);
        for (const jobId of jobIds) {
            markStatus(jobId, status);
            await notifyEasyApply(ctx, jobId, status).catch((e) => console.error("[telegram] renotify failed:", e));
        }
    }
}

export async function syncTelegramBot(ctx: AppContext): Promise<void> {
    ctxRef = ctx;
    subscribeOnce();
    const settings = await getSettings();
    const tg = settings.advanced.telegram;

    if (!tg.enabled || !tg.botToken) {
        if (botRef) await botRef.stop().catch(() => {});
        botRef = null;
        tokenRef = null;
        return;
    }

    chatIdRef = tg.chatId != null ? Number(tg.chatId) : null;

    if (botRef && tokenRef === tg.botToken) return;
    if (botRef) await botRef.stop().catch(() => {});

    const bot = new TelegramBot(tg.botToken, buildHandlers(ctx));
    bot.start();
    botRef = bot;
    tokenRef = tg.botToken;
    await renotifyPending(ctx);
}

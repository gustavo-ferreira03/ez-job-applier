import { Bot, InlineKeyboard, InputFile } from "grammy";

export interface TelegramButton {
    label: string;
    data: string;
}

export interface TelegramHandlers {
    onStart: (code: string, chatId: number) => Promise<void> | void;
    onReply: (replyToMessageId: number, text: string, chatId: number) => Promise<void> | void;
    onCallback: (data: string, messageId: number, chatId: number) => Promise<void> | void;
}

export class TelegramBot {
    private bot: Bot;

    constructor(token: string, handlers: TelegramHandlers) {
        this.bot = new Bot(token);

        this.bot.command("start", async (c) => {
            await handlers.onStart((c.match ?? "").trim(), c.chat.id);
        });

        this.bot.on("callback_query:data", async (c) => {
            const messageId = c.callbackQuery.message?.message_id;
            await c.answerCallbackQuery().catch(() => {});
            if (messageId !== undefined) {
                await handlers.onCallback(c.callbackQuery.data, messageId, c.chat?.id ?? 0);
            }
        });

        this.bot.on("message:text", async (c) => {
            const replyTo = c.message.reply_to_message?.message_id;
            if (replyTo === undefined) return;
            await handlers.onReply(replyTo, c.message.text, c.chat.id);
        });

        this.bot.catch((err) => {
            console.error("[telegram] bot error:", err.error);
        });
    }

    start(): void {
        void this.bot.start({ drop_pending_updates: true }).catch((e) => {
            console.error("[telegram] failed to start polling:", e);
        });
    }

    async stop(): Promise<void> {
        await this.bot.stop();
    }

    async send(chatId: number, text: string, buttons?: TelegramButton[]): Promise<number> {
        let keyboard: InlineKeyboard | undefined;
        if (buttons && buttons.length) {
            keyboard = new InlineKeyboard();
            for (const button of buttons) keyboard.text(button.label, button.data);
        }
        const message = await this.bot.api.sendMessage(chatId, text, {
            parse_mode: "HTML",
            ...(keyboard ? { reply_markup: keyboard } : {}),
        });
        return message.message_id;
    }

    async sendPhoto(chatId: number, filePath: string, replyToMessageId?: number): Promise<number> {
        const message = await this.bot.api.sendPhoto(
            chatId,
            new InputFile(filePath),
            replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : {},
        );
        return message.message_id;
    }

    async sendPlain(chatId: number, text: string, replyToMessageId?: number): Promise<void> {
        await this.bot.api.sendMessage(
            chatId,
            text,
            replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : {},
        );
    }
}

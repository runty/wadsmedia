import { Api, InlineKeyboard } from "grammy";
import type { Update } from "@grammyjs/types";
import type {
  InboundMessage,
  MessagingProvider,
  OutboundMessage,
  SendResult,
  WebhookValidationParams,
} from "./types.js";

export class TelegramMessagingProvider implements MessagingProvider {
  readonly providerName = "telegram" as const;
  private api: Api;
  private webhookSecret: string;

  constructor(botToken: string, webhookSecret: string) {
    this.api = new Api(botToken);
    this.webhookSecret = webhookSecret;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const chatId = message.to;

    // Build inline keyboard markup if present
    const replyMarkup = this.buildInlineKeyboard(message.inlineKeyboard);

    // Build reply_parameters for threading (group chat replies)
    const replyParameters = message.replyToMessageId
      ? { message_id: Number(message.replyToMessageId) }
      : undefined;

    if (message.photoUrl) {
      // Photo message with optional caption and inline keyboard
      const caption = message.body
        ? message.body.slice(0, 1024) // Telegram caption limit
        : undefined;
      const result = await this.api.sendPhoto(chatId, message.photoUrl, {
        caption,
        parse_mode: message.parseMode,
        reply_markup: replyMarkup,
        reply_parameters: replyParameters,
      });
      return {
        providerMessageId: String(result.message_id),
        status: "sent",
      };
    }

    // Text message with optional inline keyboard
    const result = await this.api.sendMessage(chatId, message.body ?? "", {
      parse_mode: message.parseMode,
      reply_markup: replyMarkup,
      reply_parameters: replyParameters,
    });
    return {
      providerMessageId: String(result.message_id),
      status: "sent",
    };
  }

  validateWebhook(params: WebhookValidationParams): boolean {
    const token = params.headers["x-telegram-bot-api-secret-token"];
    return typeof token === "string" && token === this.webhookSecret;
  }

  parseInbound(body: unknown): InboundMessage {
    const update = body as Update;

    if (update.message) {
      return {
        from: String(update.message.chat.id),
        to: "",
        body: update.message.text ?? "",
        providerMessageId: String(update.message.message_id),
        numMedia: 0,
        buttonPayload: null,
        buttonText: null,
      };
    }

    if (update.callback_query) {
      return {
        from: String(update.callback_query.message?.chat.id ?? ""),
        to: "",
        body: update.callback_query.data ?? "",
        providerMessageId: String(update.callback_query.id),
        numMedia: 0,
        buttonPayload: update.callback_query.data ?? null,
        buttonText: null,
      };
    }

    // Unsupported update type - return default empty message
    return {
      from: "",
      to: "",
      body: "",
      providerMessageId: "",
      numMedia: 0,
      buttonPayload: null,
      buttonText: null,
    };
  }

  formatWebhookResponse(): string | null {
    // Telegram does not reply via webhook response body
    return null;
  }

  // --- Telegram-specific public methods (not on MessagingProvider interface) ---

  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
  ): Promise<void> {
    await this.api.answerCallbackQuery(callbackQueryId, { text });
  }

  async sendChatAction(chatId: string, action: string): Promise<void> {
    await this.api.sendChatAction(
      chatId,
      action as "typing" | "upload_photo" | "record_video" | "upload_video" | "record_voice" | "upload_voice" | "upload_document" | "choose_sticker" | "find_location" | "record_video_note" | "upload_video_note",
    );
  }

  async setWebhook(url: string, secretToken: string): Promise<void> {
    await this.api.setWebhook(url, { secret_token: secretToken });
  }

  async getMe(): Promise<{ username: string }> {
    const result = await this.api.getMe();
    return { username: result.username ?? "" };
  }

  // --- Private helpers ---

  private buildInlineKeyboard(
    buttons?: OutboundMessage["inlineKeyboard"],
  ): InlineKeyboard | undefined {
    if (!buttons?.length) return undefined;

    const keyboard = new InlineKeyboard();
    for (const row of buttons) {
      for (const button of row) {
        keyboard.text(button.text, button.callbackData);
      }
      keyboard.row();
    }
    return keyboard;
  }
}

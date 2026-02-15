import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { TelegramMessagingProvider } from "../messaging/telegram-provider.js";

declare module "fastify" {
  interface FastifyInstance {
    telegramMessaging?: TelegramMessagingProvider;
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_WEBHOOK_URL } =
      fastify.config;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET) {
      fastify.log.info("Telegram messaging not configured, skipping");
      return;
    }

    const provider = new TelegramMessagingProvider(
      TELEGRAM_BOT_TOKEN,
      TELEGRAM_WEBHOOK_SECRET,
    );
    fastify.decorate("telegramMessaging", provider);

    // Verify bot token is valid
    const botInfo = await provider.getMe();
    fastify.log.info(`Telegram bot verified: @${botInfo.username}`);

    // Register webhook if URL is configured
    if (TELEGRAM_WEBHOOK_URL) {
      await provider.setWebhook(TELEGRAM_WEBHOOK_URL, TELEGRAM_WEBHOOK_SECRET);
      fastify.log.info("Telegram webhook registered");
    }
  },
  { name: "telegram-messaging" },
);

import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { TelegramMessagingProvider } from "../messaging/telegram-provider.js";

declare module "fastify" {
  interface FastifyInstance {
    telegramMessaging?: TelegramMessagingProvider;
  }
}

const MAX_RETRY_ATTEMPTS = 5;
const BASE_DELAY_MS = 2000;

async function registerWebhookWithRetry(
  provider: TelegramMessagingProvider,
  url: string,
  secret: string,
  log: FastifyBaseLogger,
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      await provider.setWebhook(url, secret);

      const suffix = attempt > 1 ? ` (attempt ${attempt}/${MAX_RETRY_ATTEMPTS})` : "";
      log.info(`Telegram webhook registered${suffix}`);

      // Verify webhook and log pending updates from downtime
      try {
        const info = await provider.getWebhookInfo();
        if (info.pending_update_count > 0) {
          log.info(
            `Telegram webhook has ${info.pending_update_count} pending update(s) queued during downtime`,
          );
        }
      } catch (verifyErr) {
        log.warn(verifyErr, "Failed to verify webhook info after registration");
      }

      return true;
    } catch (err) {
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
        log.warn(
          err,
          `Telegram webhook registration failed (attempt ${attempt}/${MAX_RETRY_ATTEMPTS}), retrying in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        log.error(
          err,
          `Telegram webhook registration failed after ${MAX_RETRY_ATTEMPTS} attempts. Webhook must be registered manually or will retry on next server restart.`,
        );
      }
    }
  }

  return false;
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

    // Register webhook with retry/backoff if URL is configured
    if (TELEGRAM_WEBHOOK_URL) {
      await registerWebhookWithRetry(
        provider,
        TELEGRAM_WEBHOOK_URL,
        TELEGRAM_WEBHOOK_SECRET,
        fastify.log,
      );
    }
  },
  { name: "telegram-messaging" },
);

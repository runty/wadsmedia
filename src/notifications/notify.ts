import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config.js";
import type * as schema from "../db/schema.js";
import { users } from "../db/schema.js";
import type { MessagingProvider } from "../messaging/types.js";

type DB = BetterSQLite3Database<typeof schema>;

export async function notifyAllActiveUsers(
  db: DB,
  messaging: MessagingProvider,
  _config: AppConfig,
  message: string,
  log: FastifyBaseLogger,
  telegramMessaging?: MessagingProvider,
): Promise<void> {
  const activeUsers = db
    .select({ phone: users.phone, telegramChatId: users.telegramChatId })
    .from(users)
    .where(eq(users.status, "active"))
    .all();

  let sentCount = 0;
  for (const user of activeUsers) {
    try {
      if (user.telegramChatId && telegramMessaging) {
        // Telegram user: send via Telegram provider
        await telegramMessaging.send({ to: user.telegramChatId, body: message });
        sentCount++;
      } else if (user.phone) {
        // SMS user: send via Twilio provider
        await messaging.send({ to: user.phone, body: message });
        sentCount++;
      }
      // Skip users with neither phone nor telegramChatId
    } catch (err) {
      log.error({ err, phone: user.phone, chatId: user.telegramChatId }, "Failed to send notification");
    }
  }

  log.info({ userCount: activeUsers.length, sentCount, message }, "Notification dispatched");
}

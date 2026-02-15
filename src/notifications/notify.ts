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
  config: AppConfig,
  message: string,
  log: FastifyBaseLogger,
): Promise<void> {
  if (!config.TWILIO_PHONE_NUMBER) {
    log.warn("Cannot send notifications: TWILIO_PHONE_NUMBER not configured");
    return;
  }

  const activeUsers = db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.status, "active"))
    .all();

  for (const user of activeUsers) {
    // Skip users without a phone number (e.g., Telegram-only users)
    if (!user.phone) continue;

    try {
      await messaging.send({
        to: user.phone,
        body: message,
        from: config.TWILIO_PHONE_NUMBER,
      });
    } catch (err) {
      log.error({ err, phone: user.phone }, "Failed to send notification");
    }
  }

  log.info({ userCount: activeUsers.length, message }, "Notification dispatched");
}

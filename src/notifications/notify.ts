import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config.js";
import type * as schema from "../db/schema.js";
import { users } from "../db/schema.js";
import type { MessagingProvider } from "../messaging/types.js";
import type { FormattedNotification } from "./formatters.js";

type DB = BetterSQLite3Database<typeof schema>;

const SMS_MAX_LENGTH = 160;
const SMS_TRUNCATED_LENGTH = 157; // 160 - 3 for "..."

/**
 * Truncate text to fit SMS length, cutting at word boundary.
 * Returns the original text if it fits within maxLength.
 */
function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, SMS_TRUNCATED_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  // If no space found, just hard-truncate (rare for notification text)
  const cutPoint = lastSpace > 0 ? lastSpace : SMS_TRUNCATED_LENGTH;
  return `${text.slice(0, cutPoint)}...`;
}

export async function notifyAllActiveUsers(
  db: DB,
  messaging: MessagingProvider,
  config: AppConfig,
  notification: FormattedNotification,
  log: FastifyBaseLogger,
  telegramMessaging?: MessagingProvider,
): Promise<void> {
  const activeUsers = db
    .select({ phone: users.phone, telegramChatId: users.telegramChatId })
    .from(users)
    .where(eq(users.status, "active"))
    .all();

  let sentCount = 0;
  let smsCount = 0;
  let telegramCount = 0;
  for (const user of activeUsers) {
    try {
      if (user.telegramChatId && telegramMessaging) {
        // Telegram user: send HTML-formatted notification
        await telegramMessaging.send({
          to: user.telegramChatId,
          body: notification.html,
          parseMode: "HTML",
        });
        sentCount++;
        telegramCount++;
      } else if (user.phone) {
        // SMS user: length-aware dispatch with MMS fallback
        const plainText = notification.plain;
        if (plainText.length > SMS_MAX_LENGTH) {
          const truncatedBody = truncateAtWordBoundary(plainText, SMS_MAX_LENGTH);
          const mediaUrl = config.MMS_PIXEL_URL ? [config.MMS_PIXEL_URL] : undefined;
          await messaging.send({ to: user.phone, body: truncatedBody, mediaUrl });
        } else {
          await messaging.send({ to: user.phone, body: plainText });
        }
        sentCount++;
        smsCount++;
      }
      // Skip users with neither phone nor telegramChatId
    } catch (err) {
      log.error(
        { err, phone: user.phone, chatId: user.telegramChatId },
        "Failed to send notification",
      );
    }
  }

  log.info(
    {
      userCount: activeUsers.length,
      sentCount,
      smsCount,
      telegramCount,
      message: notification.plain,
    },
    "Notification dispatched",
  );
}

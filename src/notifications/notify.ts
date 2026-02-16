import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config.js";
import type * as schema from "../db/schema.js";
import { users } from "../db/schema.js";
import type { MessagingProvider, OutboundMessage } from "../messaging/types.js";
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

/**
 * Send a message with a single retry on failure (2 attempts max).
 * Returns structured outcome for delivery tracking.
 */
async function sendWithRetry(
  provider: MessagingProvider,
  message: OutboundMessage,
  log: FastifyBaseLogger,
  userLabel: string,
): Promise<{ success: boolean; attempts: number; error?: string }> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await provider.send(message);
      if (attempt > 1) {
        log.info({ userLabel, attempt }, "Notification retry succeeded");
      }
      return { success: true, attempts: attempt };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (attempt === 1) {
        log.warn({ err, userLabel, attempt }, "Notification send failed, retrying");
      } else {
        log.error({ err, userLabel, attempt }, "Notification send failed after retry");
      }
      if (attempt === 2) {
        return { success: false, attempts: 2, error: errorMsg };
      }
    }
  }
  // TypeScript exhaustiveness (unreachable)
  return { success: false, attempts: 2, error: "Unknown error" };
}

export async function notifyAllActiveUsers(
  db: DB,
  messaging: MessagingProvider,
  config: AppConfig,
  notification: FormattedNotification,
  log: FastifyBaseLogger,
  telegramMessaging?: MessagingProvider,
  adminMessaging?: MessagingProvider,
  adminAddress?: string,
): Promise<void> {
  const activeUsers = db
    .select({ phone: users.phone, telegramChatId: users.telegramChatId })
    .from(users)
    .where(eq(users.status, "active"))
    .all();

  const failures: Array<{ userLabel: string; error: string }> = [];
  let successCount = 0;
  let retrySuccessCount = 0;
  let failureCount = 0;
  let smsCount = 0;
  let telegramCount = 0;

  for (const user of activeUsers) {
    if (user.telegramChatId && telegramMessaging) {
      // Telegram user: send HTML-formatted notification
      const userLabel = `TG:${user.telegramChatId}`;
      const result = await sendWithRetry(
        telegramMessaging,
        { to: user.telegramChatId, body: notification.html, parseMode: "HTML" },
        log,
        userLabel,
      );
      if (result.success) {
        successCount++;
        telegramCount++;
        if (result.attempts > 1) retrySuccessCount++;
      } else {
        failureCount++;
        failures.push({ userLabel, error: result.error ?? "Unknown error" });
      }
    } else if (user.phone) {
      // SMS user: length-aware dispatch with MMS fallback
      const userLabel = `SMS:***${user.phone.slice(-4)}`;
      const plainText = notification.plain;
      let message: OutboundMessage;
      if (plainText.length > SMS_MAX_LENGTH) {
        const truncatedBody = truncateAtWordBoundary(plainText, SMS_MAX_LENGTH);
        const mediaUrl = config.MMS_PIXEL_URL ? [config.MMS_PIXEL_URL] : undefined;
        message = { to: user.phone, body: truncatedBody, mediaUrl };
      } else {
        message = { to: user.phone, body: plainText };
      }
      const result = await sendWithRetry(messaging, message, log, userLabel);
      if (result.success) {
        successCount++;
        smsCount++;
        if (result.attempts > 1) retrySuccessCount++;
      } else {
        failureCount++;
        failures.push({ userLabel, error: result.error ?? "Unknown error" });
      }
    }
    // Skip users with neither phone nor telegramChatId
  }

  log.info(
    {
      userCount: activeUsers.length,
      successCount,
      retrySuccessCount,
      failureCount,
      smsCount,
      telegramCount,
      message: notification.plain,
    },
    "Notification dispatch complete",
  );

  // Send admin alert for persistent failures (fire-and-forget)
  if (failures.length > 0 && adminMessaging && adminAddress) {
    const failedList = failures.map((f) => `- ${f.userLabel}: ${f.error}`).join("\n");
    const alertBody = `Notification delivery failed for ${failures.length} user(s):\n${failedList}`;
    adminMessaging
      .send({ to: adminAddress, body: alertBody })
      .catch((alertErr) => log.error({ err: alertErr }, "Failed to send admin delivery alert"));
  }
}

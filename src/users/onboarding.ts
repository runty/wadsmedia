import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { FastifyBaseLogger } from "fastify";
import type { AppConfig } from "../config.js";
import type * as schema from "../db/schema.js";
import type { MessagingProvider } from "../messaging/types.js";
import { updateDisplayName } from "./user.service.js";
import type { User } from "./user.types.js";

type DB = BetterSQLite3Database<typeof schema>;

/**
 * Onboarding state machine for non-active users.
 *
 * Routes based on user status and displayName:
 * - pending + null displayName: brand new unknown user, ask for name
 * - pending + empty string displayName: asked for name, awaiting response
 * - pending + non-empty displayName: name given, waiting for approval
 * - blocked: access revoked
 * - active: should not reach here; returns null to signal normal handling
 */
export async function handleOnboarding(params: {
  user: User;
  messageBody: string;
  db: DB;
  messaging: MessagingProvider;
  config: AppConfig;
  log: FastifyBaseLogger;
}): Promise<string | null> {
  const { user, messageBody, db, messaging, config, log } = params;

  switch (user.status) {
    case "active":
      // Active users should not reach onboarding; signal normal handling
      return null;

    case "blocked":
      return "Sorry, your access has been revoked. Contact the admin if you believe this is an error.";

    case "pending": {
      // Onboarding requires a phone number (SMS users); Telegram onboarding handled separately
      const userPhone = user.phone as string;

      // Brand new unknown user: displayName is null
      if (user.displayName === null) {
        // Mark as "asked for name" by setting displayName to empty string
        updateDisplayName(db, userPhone, "");
        return "Hey there! I don't recognize your number. What's your name?";
      }

      // Asked for name, awaiting response: displayName is empty string
      if (user.displayName === "") {
        const trimmedName = messageBody.trim().slice(0, 50);

        if (trimmedName.length === 0) {
          return "I need a name to set up your account. What should I call you?";
        }

        // Store the user's name
        updateDisplayName(db, userPhone, trimmedName);

        // Notify admin about the new user
        await messaging.send({
          to: config.ADMIN_PHONE,
          body: `New user request: ${trimmedName} (${userPhone}). Add their number to PHONE_WHITELIST to approve.`,
        });

        log.info({ phone: userPhone, name: trimmedName }, "New user onboarding: admin notified");

        return `Thanks ${trimmedName}! I've sent a request to the admin for approval. You'll be able to use the app once approved.`;
      }

      // Name given, waiting for admin approval: displayName is a non-empty string
      return `Hi ${user.displayName}, your access request is still pending approval. Hang tight!`;
    }

    default:
      // Exhaustive check: should never reach here
      return null;
  }
}

import { eq, like } from "drizzle-orm";
import { z } from "zod";
import { users } from "../../db/schema.js";
import { defineTool } from "../tools.js";

export const manageUserTool = defineTool(
  "manage_user",
  "Approve or block a user. Resolve by user ID or display name. Use when the admin says 'approve [name]', 'block user 3', etc. The user will be notified on their registration channel (SMS or Telegram).",
  z.object({
    userId: z.number().optional().describe("User ID to manage (preferred over displayName)"),
    displayName: z
      .string()
      .optional()
      .describe(
        "Display name to look up (case-insensitive). Use when admin refers to user by name.",
      ),
    action: z.enum(["approve", "block"]).describe("Action to take on the user"),
  }),
  "safe",
  async (args, context) => {
    if (!context.db) {
      return { error: "Database not available" };
    }

    const db = context.db;

    // Resolve user by ID or name
    const user = await (async () => {
      if (args.userId != null) {
        return db.select().from(users).where(eq(users.id, args.userId)).get();
      }
      if (args.displayName) {
        const matches = db
          .select()
          .from(users)
          .where(like(users.displayName, args.displayName))
          .all();

        if (matches.length > 1) {
          return {
            ambiguous: true as const,
            matches: matches.map((u) => ({
              id: u.id,
              displayName: u.displayName,
              channel: u.telegramChatId ? "Telegram" : "SMS",
            })),
          };
        }
        return matches[0];
      }
      return undefined;
    })();

    if (!user) {
      return {
        error:
          args.userId != null
            ? `No user found with ID ${args.userId}`
            : `No user found with name "${args.displayName}"`,
      };
    }
    if ("ambiguous" in user) {
      return {
        error: "Multiple users match that name. Use userId to be specific.",
        matches: user.matches,
      };
    }

    // Guard: self-blocking
    if (args.action === "block" && user.id === context.userId) {
      return { error: "You can't block yourself" };
    }

    const targetStatus = args.action === "approve" ? "active" : "blocked";

    // Guard: already in target status
    if (user.status === targetStatus) {
      return { error: `${user.displayName ?? `User ${user.id}`} is already ${targetStatus}` };
    }

    // Update status
    db.update(users)
      .set({ status: targetStatus, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .run();

    // Notify the user on their registration channel
    const notification =
      args.action === "approve"
        ? "Good news! Your access has been approved. Send me a message to get started!"
        : "Your access has been revoked. Contact the admin if you believe this is an error.";

    let notified = false;

    if (user.telegramChatId && context.telegramMessaging) {
      await context.telegramMessaging
        .send({ to: user.telegramChatId, body: notification })
        .then(() => {
          notified = true;
        })
        .catch(() => {});
    } else if (user.phone && context.messaging) {
      await context.messaging
        .send({ to: user.phone, body: notification })
        .then(() => {
          notified = true;
        })
        .catch(() => {});
    }

    return {
      success: true,
      message: `${user.displayName ?? `User ${user.id}`} has been ${targetStatus === "active" ? "approved" : "blocked"}`,
      notified,
    };
  },
  "admin",
);

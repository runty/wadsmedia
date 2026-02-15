import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "../../db/schema.js";
import { defineTool } from "../tools.js";

export const listPendingUsersTool = defineTool(
  "list_pending_users",
  "List all users with pending approval status. Use when the admin asks about pending users, new user requests, or who needs approval. Returns user details including their registration channel.",
  z.object({}),
  "safe",
  async (_args, context) => {
    if (!context.db) {
      return { error: "Database not available" };
    }

    const pending = context.db
      .select({
        id: users.id,
        displayName: users.displayName,
        phone: users.phone,
        telegramUsername: users.telegramUsername,
        telegramChatId: users.telegramChatId,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.status, "pending"))
      .all();

    if (pending.length === 0) {
      return { message: "No pending users" };
    }

    return {
      pendingUsers: pending.map((u) => ({
        id: u.id,
        displayName: u.displayName,
        channel: u.telegramChatId ? "Telegram" : "SMS",
        contact: u.telegramUsername ? `@${u.telegramUsername}` : (u.phone ?? "unknown"),
        createdAt: u.createdAt,
      })),
    };
  },
  "admin",
);

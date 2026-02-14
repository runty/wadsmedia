import { eq, lt } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "../db/schema.js";
import { pendingActions } from "../db/schema.js";
import type { PendingAction } from "./types.js";

type DB = BetterSQLite3Database<typeof schema>;

/**
 * Upsert a pending action for a user (one per user via unique constraint on userId).
 * If a pending action already exists for this user, replace it.
 */
export function savePendingAction(db: DB, action: PendingAction): void {
  db.insert(pendingActions)
    .values({
      userId: action.userId,
      functionName: action.functionName,
      arguments: action.arguments,
      promptText: action.promptText,
      expiresAt: action.expiresAt,
    })
    .onConflictDoUpdate({
      target: pendingActions.userId,
      set: {
        functionName: action.functionName,
        arguments: action.arguments,
        promptText: action.promptText,
        expiresAt: action.expiresAt,
        createdAt: new Date(),
      },
    })
    .run();
}

/**
 * Get the pending action for a user.
 * Returns null if none exists or if the existing one has expired.
 */
export function getPendingAction(db: DB, userId: number): PendingAction | null {
  const row = db.select().from(pendingActions).where(eq(pendingActions.userId, userId)).get();

  if (!row) {
    return null;
  }

  // Check expiration
  if (row.expiresAt < new Date()) {
    // Expired -- clean it up and return null
    db.delete(pendingActions).where(eq(pendingActions.userId, userId)).run();
    return null;
  }

  return {
    userId: row.userId,
    functionName: row.functionName,
    arguments: row.arguments,
    promptText: row.promptText,
    expiresAt: row.expiresAt,
  };
}

/**
 * Delete the pending action for a user.
 */
export function clearPendingAction(db: DB, userId: number): void {
  db.delete(pendingActions).where(eq(pendingActions.userId, userId)).run();
}

/**
 * Delete all pending actions where expiresAt < now.
 * Called opportunistically, not on a timer.
 */
export function clearExpiredActions(db: DB): void {
  db.delete(pendingActions).where(lt(pendingActions.expiresAt, new Date())).run();
}

const CONFIRMATIONS = new Set([
  "yes",
  "y",
  "confirm",
  "do it",
  "go ahead",
  "ok",
  "sure",
  "yeah",
  "yep",
]);

const DENIALS = new Set(["no", "n", "cancel", "stop", "nevermind", "nah", "nope"]);

/**
 * Check if a message is an affirmative confirmation.
 */
export function isConfirmation(message: string): boolean {
  return CONFIRMATIONS.has(message.toLowerCase().trim());
}

/**
 * Check if a message is a denial.
 */
export function isDenial(message: string): boolean {
  return DENIALS.has(message.toLowerCase().trim());
}

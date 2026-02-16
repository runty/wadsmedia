import { asc, count, desc, eq, gte } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "../db/schema.js";
import { adminAuditLog, mediaTracking, messages, users } from "../db/schema.js";

type DB = BetterSQLite3Database<typeof schema>;

/** Get all users ordered by creation date (newest first). */
export function getAllUsers(db: DB) {
  return db.select().from(users).orderBy(desc(users.createdAt)).all();
}

/** Get a single user by ID. */
export function getUserById(db: DB, id: number) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

/** Partially update a user's fields. */
export function updateUser(
  db: DB,
  id: number,
  fields: { displayName?: string; isAdmin?: boolean; status?: string },
) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (fields.displayName !== undefined) set.displayName = fields.displayName;
  if (fields.isAdmin !== undefined) set.isAdmin = fields.isAdmin;
  if (fields.status !== undefined) set.status = fields.status;

  return db.update(users).set(set).where(eq(users.id, id)).returning().get();
}

/** Soft-delete a user by setting status to "blocked". Preserves audit trail. */
export function softDeleteUser(db: DB, id: number) {
  return db
    .update(users)
    .set({ status: "blocked", updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning()
    .get();
}

/** Get a user's message history with pagination. */
export function getUserMessages(
  db: DB,
  userId: number,
  opts?: { limit?: number; offset?: number },
) {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  return db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      toolCalls: messages.toolCalls,
      toolCallId: messages.toolCallId,
      name: messages.name,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.userId, userId))
    .orderBy(asc(messages.createdAt))
    .limit(limit)
    .offset(offset)
    .all();
}

/** Get aggregated media tracking statistics. */
export function getMediaTrackingStats(db: DB) {
  const totalRequests = db.select({ value: count() }).from(mediaTracking).get();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const last7Days = db
    .select({ value: count() })
    .from(mediaTracking)
    .where(gte(mediaTracking.addedAt, sevenDaysAgo))
    .get();

  const byMediaType = db
    .select({
      mediaType: mediaTracking.mediaType,
      count: count(),
    })
    .from(mediaTracking)
    .groupBy(mediaTracking.mediaType)
    .all();

  return {
    totalRequests: totalRequests?.value ?? 0,
    last7Days: last7Days?.value ?? 0,
    byMediaType,
  };
}

/** Get recent media additions with user info. */
export function getRecentMediaAdditions(db: DB, limit = 10) {
  return db
    .select({
      title: mediaTracking.title,
      year: mediaTracking.year,
      mediaType: mediaTracking.mediaType,
      displayName: users.displayName,
      phone: users.phone,
      addedAt: mediaTracking.addedAt,
    })
    .from(mediaTracking)
    .innerJoin(users, eq(mediaTracking.userId, users.id))
    .orderBy(desc(mediaTracking.addedAt))
    .limit(limit)
    .all();
}

/** Set the Plex user ID for a user (for per-user watch history). */
export function setPlexUserId(db: DB, userId: number, plexUserId: number | null) {
  return db
    .update(users)
    .set({ plexUserId, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning()
    .get();
}

/** Insert an audit log entry for admin user management actions. */
export function insertAuditLog(
  db: DB,
  entry: {
    adminIdentity: string;
    action: "approve" | "block" | "remove";
    targetUserId: number;
    targetDisplayName?: string | null;
    details?: string;
  },
) {
  return db
    .insert(adminAuditLog)
    .values({
      adminIdentity: entry.adminIdentity,
      action: entry.action,
      targetUserId: entry.targetUserId,
      targetDisplayName: entry.targetDisplayName ?? null,
      details: entry.details ?? null,
    })
    .returning()
    .get();
}

/** Get recent audit log entries ordered by newest first. */
export function getRecentAuditLogs(db: DB, limit = 50) {
  return db
    .select({
      id: adminAuditLog.id,
      adminIdentity: adminAuditLog.adminIdentity,
      action: adminAuditLog.action,
      targetUserId: adminAuditLog.targetUserId,
      targetDisplayName: adminAuditLog.targetDisplayName,
      details: adminAuditLog.details,
      createdAt: adminAuditLog.createdAt,
      currentDisplayName: users.displayName,
    })
    .from(adminAuditLog)
    .leftJoin(users, eq(adminAuditLog.targetUserId, users.id))
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit)
    .all();
}

/** Get users with "pending" status, ordered by creation date (oldest first). */
export function getPendingUsers(db: DB) {
  return db
    .select()
    .from(users)
    .where(eq(users.status, "pending"))
    .orderBy(asc(users.createdAt))
    .all();
}

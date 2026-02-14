import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "../db/schema.js";
import { users } from "../db/schema.js";
import type { UserStatus } from "./user.types.js";

type DB = BetterSQLite3Database<typeof schema>;

export function findUserByPhone(db: DB, phone: string) {
  return db.select().from(users).where(eq(users.phone, phone)).get();
}

export function createUser(
  db: DB,
  phone: string,
  opts?: { displayName?: string; status?: UserStatus; isAdmin?: boolean },
) {
  return db
    .insert(users)
    .values({
      phone,
      displayName: opts?.displayName,
      status: opts?.status ?? "pending",
      isAdmin: opts?.isAdmin ?? false,
    })
    .returning()
    .get();
}

export function upsertUser(
  db: DB,
  phone: string,
  opts?: { displayName?: string; status?: UserStatus; isAdmin?: boolean },
) {
  return db
    .insert(users)
    .values({
      phone,
      displayName: opts?.displayName,
      status: opts?.status ?? "pending",
      isAdmin: opts?.isAdmin ?? false,
    })
    .onConflictDoUpdate({
      target: users.phone,
      set: {
        status: opts?.status ?? "pending",
        isAdmin: opts?.isAdmin ?? false,
        updatedAt: new Date(),
      },
    })
    .returning()
    .get();
}

export function updateUserStatus(db: DB, phone: string, status: UserStatus) {
  return db
    .update(users)
    .set({ status, updatedAt: new Date() })
    .where(eq(users.phone, phone))
    .returning()
    .get();
}

export function updateDisplayName(db: DB, phone: string, displayName: string) {
  return db
    .update(users)
    .set({ displayName, updatedAt: new Date() })
    .where(eq(users.phone, phone))
    .returning()
    .get();
}

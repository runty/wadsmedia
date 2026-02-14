import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Phase 1: Minimal schema to prove migrations work
// Real tables (users, conversations, messages) added in later phases
export const appMetadata = sqliteTable("app_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

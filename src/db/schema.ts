import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Phase 1: Minimal schema to prove migrations work
export const appMetadata = sqliteTable("app_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Phase 3: User identity and authorization
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  phone: text("phone").notNull().unique(),
  displayName: text("display_name"),
  status: text("status", { enum: ["active", "pending", "blocked"] })
    .notNull()
    .default("pending"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Phase 5: Conversation message history
export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  role: text("role", { enum: ["user", "assistant", "tool", "system"] }).notNull(),
  content: text("content"),
  toolCalls: text("tool_calls"),
  toolCallId: text("tool_call_id"),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Phase 5: Pending destructive actions awaiting user confirmation
export const pendingActions = sqliteTable("pending_actions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id)
    .unique(),
  functionName: text("function_name").notNull(),
  arguments: text("arguments").notNull(),
  promptText: text("prompt_text").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

// Phase 10: Per-user media addition tracking
export const mediaTracking = sqliteTable("media_tracking", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  mediaType: text("media_type", { enum: ["movie", "series"] }).notNull(),
  title: text("title").notNull(),
  year: integer("year"),
  externalId: text("external_id").notNull(), // tmdbId for movies, tvdbId for series
  sonarrRadarrId: integer("sonarr_radarr_id"),
  addedAt: integer("added_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

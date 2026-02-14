import type { users } from "../db/schema.js";

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserStatus = "active" | "pending" | "blocked";

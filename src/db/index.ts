import type BetterSqlite3 from "better-sqlite3";
import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export interface DatabaseConnection {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: BetterSqlite3.Database;
}

export function createDatabase(dbPath: string): DatabaseConnection {
  const sqlite = new Database(dbPath);

  // Performance pragmas -- order matters
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = normal");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const db = drizzle(sqlite, { schema });

  return { db, sqlite };
}

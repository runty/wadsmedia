import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

import type { DatabaseConnection } from "../db/index.js";
import { createDatabase } from "../db/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

declare module "fastify" {
  interface FastifyInstance {
    db: DatabaseConnection["db"];
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const dbPath = fastify.config.DATABASE_PATH;
    const { db, sqlite } = createDatabase(dbPath);

    // Run pending migrations on startup
    // Path resolved relative to compiled output location (dist/plugins/)
    const migrationsFolder = path.join(__dirname, "../../drizzle");
    migrate(db, { migrationsFolder });

    fastify.log.info("Database connected and migrations applied");

    fastify.decorate("db", db);

    // Graceful shutdown: close database on server close
    fastify.addHook("onClose", () => {
      fastify.log.info("Closing database connection");
      sqlite.close();
    });
  },
  { name: "database" },
);

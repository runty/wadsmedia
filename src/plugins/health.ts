import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

// --- In-memory sliding-window error rate tracker ---
const errorTimestamps: number[] = [];
const ERROR_WINDOW_MS = 5 * 60 * 1000; // 5-minute window

/** Manually record an error timestamp (for caught errors that don't produce 5xx). */
export function recordError(): void {
  errorTimestamps.push(Date.now());
}

/** Get recent error count within the sliding window, pruning old entries. */
function getRecentErrorRate(): { count: number; windowMinutes: number } {
  const cutoff = Date.now() - ERROR_WINDOW_MS;
  // Prune old entries in-place
  let i = 0;
  while (i < errorTimestamps.length && (errorTimestamps[i] ?? 0) < cutoff) {
    i++;
  }
  if (i > 0) {
    errorTimestamps.splice(0, i);
  }
  return { count: errorTimestamps.length, windowMinutes: 5 };
}

export default fp(
  async (fastify: FastifyInstance) => {
    // Track 5xx responses
    fastify.addHook("onResponse", (_request, reply, done) => {
      if (reply.statusCode >= 500) {
        errorTimestamps.push(Date.now());
      }
      done();
    });

    // Track caught errors (even if response isn't 5xx)
    fastify.addHook("onError", (_request, _reply, _error, done) => {
      errorTimestamps.push(Date.now());
      done();
    });

    fastify.get("/health", async (_request, reply) => {
      let dbStatus = "ok";
      try {
        fastify.db.run(sql`SELECT 1`);
      } catch {
        dbStatus = "error";
      }

      const status = dbStatus === "ok" ? "ok" : "degraded";
      const statusCode = status === "ok" ? 200 : 503;

      return reply.code(statusCode).send({
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: {
          database: dbStatus,
        },
      });
    });
  },
  { name: "health" },
);

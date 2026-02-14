import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

export default fp(
  async (fastify: FastifyInstance) => {
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

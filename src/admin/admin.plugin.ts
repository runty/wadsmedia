import path from "node:path";
import secureSession from "@fastify/secure-session";
import fastifyStatic from "@fastify/static";
import view from "@fastify/view";
import { Eta } from "eta";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import adminRoutes from "./admin.routes.js";

export default fp(
  async (fastify: FastifyInstance) => {
    if (!fastify.config.ADMIN_SESSION_SECRET || !fastify.config.ADMIN_PASSWORD) {
      fastify.log.warn(
        "Admin dashboard not configured (set ADMIN_SESSION_SECRET and ADMIN_PASSWORD)",
      );
      return;
    }

    // Template engine (Eta)
    const eta = new Eta();
    await fastify.register(view, {
      engine: { eta },
      root: path.join(process.cwd(), "admin-views"),
      viewExt: "eta",
    });

    // Static assets
    await fastify.register(fastifyStatic, {
      root: path.join(process.cwd(), "admin-assets"),
      prefix: "/admin/assets/",
      decorateReply: false,
    });

    // Session management
    await fastify.register(secureSession, {
      secret: fastify.config.ADMIN_SESSION_SECRET,
      salt: "wadsmedia-admin!", // exactly 16 bytes
      cookie: {
        path: "/admin",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 86400, // 24 hours
      },
    });

    // Admin routes
    await fastify.register(adminRoutes, { prefix: "/admin" });

    fastify.log.info("Admin dashboard registered at /admin");
  },
  { name: "admin-dashboard", dependencies: ["database"] },
);

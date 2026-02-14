import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { createUser, findUserByPhone, upsertUser } from "../users/user.service.js";
import type { User } from "../users/user.types.js";

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }
  interface FastifyInstance {
    resolveUser: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    // Decorate request with null initial value (Fastify pattern for reference types)
    fastify.decorateRequest("user", null);

    // --- Startup seeding ---

    const adminPhone = fastify.config.ADMIN_PHONE;
    const whitelist = fastify.config.PHONE_WHITELIST;

    // Seed admin user as active with isAdmin flag
    if (adminPhone) {
      upsertUser(fastify.db, adminPhone, {
        status: "active",
        isAdmin: true,
      });
      fastify.log.info(`Admin user seeded: ${adminPhone}`);
    }

    // Seed whitelisted users as active
    if (whitelist) {
      for (const phone of whitelist) {
        // Skip if this phone was already seeded as admin (preserve isAdmin flag)
        if (phone === adminPhone) continue;

        upsertUser(fastify.db, phone, { status: "active" });
        fastify.log.info(`Whitelisted user seeded: ${phone}`);
      }
    }

    // --- resolveUser preHandler ---

    async function resolveUserHandler(
      request: FastifyRequest,
      _reply: FastifyReply,
    ): Promise<void> {
      const body = request.body as Record<string, string> | undefined;
      const phone = body?.From;

      if (!phone) {
        request.log.warn("No From field in request body, skipping user resolution");
        request.user = null;
        return;
      }

      const existing = findUserByPhone(fastify.db, phone);
      if (existing) {
        request.user = existing;
      } else {
        const newUser = createUser(fastify.db, phone, { status: "pending" });
        request.user = newUser;
      }
    }

    fastify.decorate("resolveUser", resolveUserHandler);
  },
  { name: "user-resolver", dependencies: ["database"] },
);

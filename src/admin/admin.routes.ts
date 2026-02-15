import type { FastifyInstance } from "fastify";
import { loginHandler, logoutHandler, requireAuth } from "./admin.auth.js";
import {
  getAllUsers,
  getMediaTrackingStats,
  getRecentMediaAdditions,
  getUserById,
  getUserMessages,
  setPlexUserId,
  softDeleteUser,
  updateUser,
} from "./admin.service.js";

// Route generic interfaces
interface IdParams {
  Params: { id: string };
}

interface IdParamsWithUserBody {
  Params: { id: string };
  Body: { displayName?: string; isAdmin?: boolean; status?: string };
}

interface IdParamsWithPagination {
  Params: { id: string };
  Querystring: { limit?: string; offset?: string };
}

interface IdParamsWithPlexBody {
  Params: { id: string };
  Body: { plexUserId: number | null };
}

/** Admin route plugin -- NOT wrapped in fp() to stay encapsulated within the /admin prefix. */
export default async function adminRoutes(fastify: FastifyInstance) {
  const authOpts = { preHandler: [requireAuth] };

  // --- Public routes (no auth) ---

  fastify.get("/login", async (_request, reply) => {
    return reply.viewAsync("pages/login", {});
  });

  fastify.post("/login", loginHandler(fastify));

  // --- Protected routes ---

  fastify.post("/logout", { ...authOpts }, logoutHandler);

  // Dashboard home
  fastify.get("/", { ...authOpts }, async (request, reply) => {
    const stats = getMediaTrackingStats(fastify.db);
    const recentAdditions = getRecentMediaAdditions(fastify.db);
    const userCount = getAllUsers(fastify.db).length;

    const data = { stats, recentAdditions, userCount };

    if (request.headers["hx-request"] === "true") {
      return reply.viewAsync("partials/dashboard-content", data);
    }
    return reply.viewAsync("pages/dashboard", data);
  });

  // User list
  fastify.get("/users", { ...authOpts }, async (request, reply) => {
    const users = getAllUsers(fastify.db);

    if (request.headers["hx-request"] === "true") {
      return reply.viewAsync("partials/user-list", { users });
    }
    return reply.viewAsync("pages/users", { users });
  });

  // User detail (API/htmx)
  fastify.get<IdParams>("/api/users/:id", { ...authOpts }, async (request, reply) => {
    const id = Number(request.params.id);
    const user = getUserById(fastify.db, id);
    if (!user) return reply.code(404).send({ error: "User not found" });

    if (request.headers["hx-request"] === "true") {
      return reply.viewAsync("partials/user-detail", { user });
    }
    return reply.send(user);
  });

  // Update user
  fastify.post<IdParamsWithUserBody>("/api/users/:id", { ...authOpts }, async (request, reply) => {
    const id = Number(request.params.id);
    const existing = getUserById(fastify.db, id);
    if (!existing) return reply.code(404).send({ error: "User not found" });

    const updated = updateUser(fastify.db, id, request.body);
    if (request.headers["hx-request"] === "true") {
      return reply.viewAsync("partials/user-detail", { user: updated });
    }
    return reply.send(updated);
  });

  // Soft delete user
  fastify.post<IdParams>("/api/users/:id/delete", { ...authOpts }, async (request, reply) => {
    const id = Number(request.params.id);
    const existing = getUserById(fastify.db, id);
    if (!existing) return reply.code(404).send({ error: "User not found" });

    const deleted = softDeleteUser(fastify.db, id);
    if (request.headers["hx-request"] === "true") {
      return reply.viewAsync("partials/user-detail", { user: deleted });
    }
    return reply.send(deleted);
  });

  // User messages (chat history)
  fastify.get<IdParamsWithPagination>(
    "/api/users/:id/messages",
    { ...authOpts },
    async (request, reply) => {
      const userId = Number(request.params.id);
      const limit = request.query.limit ? Number(request.query.limit) : 100;
      const offset = request.query.offset ? Number(request.query.offset) : 0;

      const msgs = getUserMessages(fastify.db, userId, { limit, offset });

      if (request.headers["hx-request"] === "true") {
        return reply.viewAsync("partials/chat-history", { messages: msgs, userId });
      }
      return reply.send(msgs);
    },
  );

  // System health (JSON for htmx polling)
  fastify.get("/api/health", { ...authOpts }, async (_request, reply) => {
    const checks = await Promise.allSettled([
      fastify.sonarr?.healthCheck(),
      fastify.radarr?.healthCheck(),
      fastify.plex?.healthCheck(),
      fastify.tautulli?.healthCheck(),
    ]);

    const health = {
      sonarr: {
        configured: !!fastify.sonarr,
        healthy: checks[0]?.status === "fulfilled" && checks[0].value === true,
      },
      radarr: {
        configured: !!fastify.radarr,
        healthy: checks[1]?.status === "fulfilled" && checks[1].value === true,
      },
      plex: {
        configured: !!fastify.plex,
        healthy: checks[2]?.status === "fulfilled" && checks[2].value === true,
      },
      tautulli: {
        configured: !!fastify.tautulli,
        healthy: checks[3]?.status === "fulfilled" && checks[3].value === true,
      },
    };

    return reply.send(health);
  });

  // Media tracking stats (JSON)
  fastify.get("/api/stats", { ...authOpts }, async (_request, reply) => {
    const stats = getMediaTrackingStats(fastify.db);
    return reply.send(stats);
  });

  // List Tautulli users for Plex linking dropdown
  fastify.get("/api/plex-users", { ...authOpts }, async (_request, reply) => {
    if (!fastify.tautulli) {
      return reply.code(404).send({ error: "Tautulli not configured" });
    }

    const tautulliUsers = await fastify.tautulli.getUsers();
    return reply.send(tautulliUsers);
  });

  // Link Plex user ID to a wadsmedia user
  fastify.post<IdParamsWithPlexBody>(
    "/api/users/:id/link-plex",
    { ...authOpts },
    async (request, reply) => {
      const id = Number(request.params.id);
      const existing = getUserById(fastify.db, id);
      if (!existing) return reply.code(404).send({ error: "User not found" });

      const updated = setPlexUserId(fastify.db, id, request.body.plexUserId);
      if (request.headers["hx-request"] === "true") {
        return reply.viewAsync("partials/user-detail", { user: updated });
      }
      return reply.send(updated);
    },
  );
}

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

interface IdParamsWithEdit {
  Params: { id: string };
  Querystring: { edit?: string };
}

interface IdParamsWithUserBody {
  Params: { id: string };
  Body: { displayName?: string; isAdmin?: string | boolean; status?: string };
}

interface IdParamsWithPagination {
  Params: { id: string };
  Querystring: { limit?: string; offset?: string };
}

interface IdParamsWithPlexBody {
  Params: { id: string };
  Body: { plexUserId: string | number | null };
}

/** Admin route plugin -- NOT wrapped in fp() to stay encapsulated within the /admin prefix. */
export default async function adminRoutes(fastify: FastifyInstance) {
  const authOpts = { preHandler: [requireAuth] };

  // --- Public routes (no auth) ---

  fastify.get("/login", async (_request, reply) => {
    return reply.viewAsync("pages/login", { error: null });
  });

  fastify.post("/login", loginHandler(fastify));

  // --- Protected routes ---

  fastify.post("/logout", { ...authOpts }, logoutHandler);

  // Dashboard home
  fastify.get("/", { ...authOpts }, async (_request, reply) => {
    const stats = getMediaTrackingStats(fastify.db);
    const recentAdditions = getRecentMediaAdditions(fastify.db);

    // Run health checks in parallel
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

    return reply.viewAsync("pages/dashboard", { stats, health, recentAdditions });
  });

  // User list page
  fastify.get("/users", { ...authOpts }, async (_request, reply) => {
    const users = getAllUsers(fastify.db);
    return reply.viewAsync("pages/users", { users });
  });

  // User detail page (full page)
  fastify.get<IdParams>("/users/:id", { ...authOpts }, async (request, reply) => {
    const id = Number(request.params.id);
    const user = getUserById(fastify.db, id);
    if (!user) return reply.code(404).send({ error: "User not found" });

    // Optionally fetch Tautulli/Plex users for linking
    let plexUsers = null;
    let linkedPlexUser = null;

    if (fastify.tautulli) {
      try {
        const tautulliUsers = await fastify.tautulli.getUsers();
        plexUsers = tautulliUsers;
        if (user.plexUserId) {
          const match = tautulliUsers.find(
            (u: { user_id: number; friendly_name?: string; username?: string }) =>
              u.user_id === user.plexUserId,
          );
          linkedPlexUser = match?.friendly_name || match?.username || `ID: ${user.plexUserId}`;
        }
      } catch {
        // Tautulli unavailable -- omit plex linking section
      }
    }

    return reply.viewAsync("pages/user-detail", { user, plexUsers, linkedPlexUser });
  });

  // User detail API (htmx: returns row partial or edit form)
  fastify.get<IdParamsWithEdit>("/api/users/:id", { ...authOpts }, async (request, reply) => {
    const id = Number(request.params.id);
    const user = getUserById(fastify.db, id);
    if (!user) return reply.code(404).send({ error: "User not found" });

    // If ?edit=true, return edit form; otherwise return read-only row
    if (request.query.edit === "true") {
      return reply.viewAsync("partials/user-edit-form", { user });
    }
    return reply.viewAsync("partials/user-row", { user });
  });

  // Update user (htmx: returns updated row partial)
  fastify.post<IdParamsWithUserBody>("/api/users/:id", { ...authOpts }, async (request, reply) => {
    const id = Number(request.params.id);
    const existing = getUserById(fastify.db, id);
    if (!existing) return reply.code(404).send({ error: "User not found" });

    // Normalize isAdmin: htmx form sends "true" as string, or omits field if unchecked
    const body = request.body;
    const isAdmin = body.isAdmin === "true" || body.isAdmin === true;

    const updated = updateUser(fastify.db, id, {
      displayName: body.displayName,
      isAdmin,
      status: body.status,
    });

    if (request.headers["hx-request"] === "true") {
      return reply.viewAsync("partials/user-row", { user: updated });
    }
    return reply.send(updated);
  });

  // Soft delete user (htmx: returns updated row with blocked status)
  fastify.post<IdParams>("/api/users/:id/delete", { ...authOpts }, async (request, reply) => {
    const id = Number(request.params.id);
    const existing = getUserById(fastify.db, id);
    if (!existing) return reply.code(404).send({ error: "User not found" });

    const deleted = softDeleteUser(fastify.db, id);
    if (request.headers["hx-request"] === "true") {
      return reply.viewAsync("partials/user-row", { user: deleted });
    }
    return reply.send(deleted);
  });

  // User messages (chat history, htmx partial)
  fastify.get<IdParamsWithPagination>(
    "/api/users/:id/messages",
    { ...authOpts },
    async (request, reply) => {
      const userId = Number(request.params.id);
      const limit = request.query.limit ? Number(request.query.limit) : 100;
      const offset = request.query.offset ? Number(request.query.offset) : 0;

      const msgs = getUserMessages(fastify.db, userId, { limit: limit + 1, offset });
      const hasMore = msgs.length > limit;
      const messages = hasMore ? msgs.slice(0, limit) : msgs;

      if (request.headers["hx-request"] === "true") {
        return reply.viewAsync("partials/chat-messages", {
          messages,
          userId,
          hasMore,
          nextOffset: offset + limit,
        });
      }
      return reply.send({ messages, hasMore, nextOffset: offset + limit });
    },
  );

  // System health (htmx partial or JSON)
  fastify.get("/api/health", { ...authOpts }, async (request, reply) => {
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

    if (request.headers["hx-request"] === "true") {
      return reply.viewAsync("partials/health-status", { health });
    }
    return reply.send(health);
  });

  // Media tracking stats (htmx partial or JSON)
  fastify.get("/api/stats", { ...authOpts }, async (request, reply) => {
    const stats = getMediaTrackingStats(fastify.db);
    if (request.headers["hx-request"] === "true") {
      return reply.viewAsync("partials/stats-cards", { stats });
    }
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

      const plexUserId = request.body.plexUserId ? Number(request.body.plexUserId) : null;

      const updated = setPlexUserId(fastify.db, id, plexUserId);
      if (request.headers["hx-request"] === "true") {
        // Redirect back to user detail page to re-render Plex section
        return reply.header("HX-Redirect", `/admin/users/${id}`).code(200).send();
      }
      return reply.send(updated);
    },
  );
}

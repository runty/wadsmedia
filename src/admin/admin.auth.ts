import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

// Augment the SessionData interface so session.get/set accept "adminUserId"
declare module "@fastify/secure-session" {
  interface SessionData {
    adminUserId: string;
  }
}

/**
 * Pre-handler that requires an authenticated admin session.
 * Redirects to login page for browser requests, sends HX-Redirect header for htmx requests.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const adminUserId = request.session.get("adminUserId");
  if (adminUserId) return;

  // htmx requests: send redirect header so htmx replaces the page
  if (request.headers["hx-request"] === "true") {
    return reply.header("HX-Redirect", "/admin/login").code(200).send();
  }

  // Browser requests: standard redirect
  return reply.redirect("/admin/login");
}

/**
 * POST /admin/login handler.
 * Validates password against ADMIN_PASSWORD config, sets session on success.
 */
export function loginHandler(fastify: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { password?: string } | undefined;
    const password = body?.password;

    if (!password || password !== fastify.config.ADMIN_PASSWORD) {
      return reply.code(401).send({ error: "Invalid password" });
    }

    request.session.set("adminUserId", "admin");
    return reply.redirect("/admin");
  };
}

/**
 * POST /admin/logout handler.
 * Destroys session and redirects to login page.
 */
export async function logoutHandler(request: FastifyRequest, reply: FastifyReply) {
  request.session.delete();
  return reply.redirect("/admin/login");
}

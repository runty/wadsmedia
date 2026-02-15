import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { TautulliClient } from "../media/tautulli/tautulli.client.js";

declare module "fastify" {
  interface FastifyInstance {
    tautulli?: TautulliClient;
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const { TAUTULLI_URL, TAUTULLI_API_KEY } = fastify.config;

    if (!TAUTULLI_URL || !TAUTULLI_API_KEY) {
      fastify.log.warn(
        "Tautulli not configured (set TAUTULLI_URL and TAUTULLI_API_KEY), watch history unavailable",
      );
      return;
    }

    const client = new TautulliClient(TAUTULLI_URL, TAUTULLI_API_KEY);
    const healthy = await client.healthCheck();

    fastify.decorate("tautulli", client);

    if (healthy) {
      fastify.log.info("Tautulli configured");
    } else {
      fastify.log.error("Tautulli configured (health check failed, API may be unreachable)");
    }
  },
  { name: "tautulli", dependencies: ["database"] },
);

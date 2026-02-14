import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { RadarrClient } from "../media/radarr/radarr.client.js";

declare module "fastify" {
  interface FastifyInstance {
    radarr?: RadarrClient;
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const { RADARR_URL, RADARR_API_KEY } = fastify.config;

    if (!RADARR_URL || !RADARR_API_KEY) {
      fastify.log.warn("Radarr not configured, client unavailable");
      return;
    }

    const client = new RadarrClient(RADARR_URL, RADARR_API_KEY);

    try {
      await client.loadCachedData();
      fastify.log.info(
        {
          profiles: client.qualityProfiles.length,
          rootFolders: client.rootFolders.length,
        },
        "Radarr connected, cached data loaded",
      );
    } catch (err) {
      fastify.log.error(
        { err },
        "Radarr unreachable on startup, client registered in degraded mode",
      );
    }

    fastify.decorate("radarr", client);
  },
  { name: "radarr", dependencies: ["database"] },
);

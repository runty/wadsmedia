import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { SonarrClient } from "../media/sonarr/sonarr.client.js";

declare module "fastify" {
  interface FastifyInstance {
    sonarr?: SonarrClient;
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const { SONARR_URL, SONARR_API_KEY } = fastify.config;

    if (!SONARR_URL || !SONARR_API_KEY) {
      fastify.log.warn("Sonarr not configured, client unavailable");
      return;
    }

    const client = new SonarrClient(SONARR_URL, SONARR_API_KEY);

    try {
      await client.loadCachedData();
      fastify.log.info(
        {
          profiles: client.qualityProfiles.length,
          rootFolders: client.rootFolders.length,
        },
        "Sonarr connected, cached data loaded",
      );
    } catch (err) {
      fastify.log.error(
        { err },
        "Sonarr unreachable on startup, client registered in degraded mode",
      );
    }

    fastify.decorate("sonarr", client);
  },
  { name: "sonarr", dependencies: ["database"] },
);

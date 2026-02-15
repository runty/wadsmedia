import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { PlexClient } from "../media/plex/plex.client.js";

declare module "fastify" {
  interface FastifyInstance {
    plex?: PlexClient;
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const { PLEX_URL, PLEX_TOKEN } = fastify.config;

    if (!PLEX_URL || !PLEX_TOKEN) {
      fastify.log.warn(
        "Plex not configured (set PLEX_URL and PLEX_TOKEN), library checks unavailable",
      );
      return;
    }

    const client = new PlexClient(PLEX_URL, PLEX_TOKEN);

    // Verify connectivity before starting cache load
    const healthy = await client.healthCheck();
    if (!healthy) {
      fastify.log.error("Plex server is unreachable or token is invalid, skipping library cache");
      fastify.decorate("plex", client);
      return;
    }

    // Start library cache load asynchronously (do NOT block server startup)
    client
      .loadLibraryCache()
      .then(() => {
        fastify.log.info({ cacheSize: client.cacheSize }, "Plex library cache loaded");
      })
      .catch((err) => {
        fastify.log.error({ err }, "Failed to load Plex library cache on startup");
      });

    // Periodic cache refresh every 15 minutes
    const cacheRefreshInterval = setInterval(
      () => {
        client.loadLibraryCache().catch((err) => {
          fastify.log.error({ err }, "Plex library cache refresh failed");
        });
      },
      15 * 60 * 1000,
    );

    // Periodic health check every 30 minutes
    const healthCheckInterval = setInterval(
      () => {
        client.healthCheck().then((isHealthy) => {
          if (!isHealthy) {
            fastify.log.warn("Plex server health check failed");
          }
        });
      },
      30 * 60 * 1000,
    );

    // Clean up intervals on server close
    fastify.addHook("onClose", () => {
      clearInterval(cacheRefreshInterval);
      clearInterval(healthCheckInterval);
    });

    fastify.decorate("plex", client);
    fastify.log.info("Plex client configured, library cache loading...");
  },
  { name: "plex", dependencies: ["database"] },
);

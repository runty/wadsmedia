import formbody from "@fastify/formbody";
import Fastify from "fastify";
import adminPlugin from "./admin/admin.plugin.js";
import type { AppConfig } from "./config.js";
import bravePlugin from "./plugins/brave.js";
import conversationPlugin from "./plugins/conversation.js";
import databasePlugin from "./plugins/database.js";
import healthPlugin from "./plugins/health.js";
import messagingPlugin from "./plugins/messaging.js";
import notificationsPlugin from "./plugins/notifications.js";
import plexPlugin from "./plugins/plex.js";
import radarrPlugin from "./plugins/radarr.js";
import sonarrPlugin from "./plugins/sonarr.js";
import tautulliPlugin from "./plugins/tautulli.js";
import tmdbPlugin from "./plugins/tmdb.js";
import userResolverPlugin from "./plugins/user-resolver.js";
import webhookPlugin from "./plugins/webhook.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
  }
}

export async function buildServer(config: AppConfig) {
  const fastify = Fastify({
    logger:
      config.NODE_ENV === "development"
        ? {
            transport: {
              target: "pino-pretty",
              options: {
                translateTime: "HH:MM:ss Z",
                ignore: "pid,hostname",
              },
            },
          }
        : true,
  });

  fastify.decorate("config", config);

  // Register plugins
  await fastify.register(databasePlugin);
  await fastify.register(healthPlugin);
  await fastify.register(sonarrPlugin);
  await fastify.register(radarrPlugin);
  await fastify.register(tmdbPlugin);
  await fastify.register(bravePlugin);
  await fastify.register(plexPlugin);
  await fastify.register(tautulliPlugin);
  await fastify.register(conversationPlugin);
  await fastify.register(formbody);
  await fastify.register(messagingPlugin);
  await fastify.register(userResolverPlugin);
  await fastify.register(webhookPlugin);
  await fastify.register(notificationsPlugin);
  await fastify.register(adminPlugin);

  return fastify;
}

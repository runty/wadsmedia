import formbody from "@fastify/formbody";
import Fastify from "fastify";
import type { AppConfig } from "./config.js";
import databasePlugin from "./plugins/database.js";
import healthPlugin from "./plugins/health.js";
import messagingPlugin from "./plugins/messaging.js";
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
  await fastify.register(formbody);
  await fastify.register(messagingPlugin);
  await fastify.register(userResolverPlugin);
  await fastify.register(webhookPlugin);

  return fastify;
}

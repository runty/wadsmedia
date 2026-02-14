import Fastify from "fastify";
import type { AppConfig } from "./config.js";
import databasePlugin from "./plugins/database.js";
import healthPlugin from "./plugins/health.js";

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

  return fastify;
}

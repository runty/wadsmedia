import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { BraveSearchClient } from "../media/brave/brave.client.js";

declare module "fastify" {
  interface FastifyInstance {
    brave?: BraveSearchClient;
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const { BRAVE_SEARCH_API_KEY } = fastify.config;

    if (!BRAVE_SEARCH_API_KEY) {
      fastify.log.warn(
        "Brave Search not configured (set BRAVE_SEARCH_API_KEY), web search unavailable",
      );
      return;
    }

    const client = new BraveSearchClient(BRAVE_SEARCH_API_KEY);
    fastify.decorate("brave", client);

    fastify.log.info("Brave Search configured");
  },
  { name: "brave", dependencies: ["database"] },
);

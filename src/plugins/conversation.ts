import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type OpenAI from "openai";
import { createLLMClient } from "../conversation/llm.js";
import { createToolRegistry, type ToolRegistry } from "../conversation/tools.js";

declare module "fastify" {
  interface FastifyInstance {
    llm: OpenAI;
    toolRegistry: ToolRegistry;
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL } = fastify.config;

    if (!LLM_API_KEY && !LLM_BASE_URL) {
      fastify.log.warn(
        "LLM not configured (set LLM_API_KEY or LLM_BASE_URL), conversation engine unavailable",
      );
      return;
    }

    const client = createLLMClient(fastify.config);
    const registry = createToolRegistry();

    fastify.decorate("llm", client);
    fastify.decorate("toolRegistry", registry);

    fastify.log.info({ model: LLM_MODEL }, "Conversation engine initialized");
  },
  { name: "conversation", dependencies: ["database"] },
);

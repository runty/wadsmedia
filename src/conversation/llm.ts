import OpenAI from "openai";
import type { AppConfig } from "../config.js";

export function createLLMClient(config: AppConfig): OpenAI {
  return new OpenAI({
    apiKey: config.LLM_API_KEY ?? "not-needed", // Ollama ignores apiKey
    ...(config.LLM_BASE_URL ? { baseURL: config.LLM_BASE_URL } : {}),
  });
}

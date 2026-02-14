import { z } from "zod";
import type {
  ChatCompletionFunctionTool,
  ConfirmationTier,
  ToolContext,
  ToolDefinition,
} from "./types.js";

/**
 * Define a tool with Zod parameter schema, confirmation tier, and executor.
 * Converts the Zod schema to JSON Schema for the OpenAI tool definition format.
 */
export function defineTool<T extends z.ZodType>(
  name: string,
  description: string,
  parameters: T,
  tier: ConfirmationTier,
  execute: (args: z.infer<T>, context: ToolContext) => Promise<unknown>,
): ToolDefinition {
  const jsonSchema = z.toJSONSchema(parameters, {
    target: "draft-7",
  }) as Record<string, unknown>;

  return {
    definition: {
      type: "function",
      function: {
        name,
        description,
        parameters: jsonSchema,
      },
    },
    tier,
    paramSchema: parameters,
    execute: execute as (args: unknown, context: ToolContext) => Promise<unknown>,
  };
}

/**
 * Registry that stores tool definitions keyed by function name.
 * Provides lookup, listing, and destructive-tier checking.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  /** Register a tool definition in the registry. */
  register(tool: ToolDefinition): void {
    this.tools.set(tool.definition.function.name, tool);
  }

  /** Get a tool definition by function name, or undefined if not found. */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** Return all tool definitions in OpenAI ChatCompletionFunctionTool format. */
  getDefinitions(): ChatCompletionFunctionTool[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /** Check if a tool is classified as destructive. */
  isDestructive(name: string): boolean {
    const tool = this.tools.get(name);
    return tool?.tier === "destructive";
  }
}

/**
 * Create a new ToolRegistry with one check_status tool for end-to-end validation.
 */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  const checkStatus = defineTool(
    "check_status",
    "Check if media servers (Sonarr and Radarr) are reachable",
    z.object({}),
    "safe",
    async (_args: unknown, context: ToolContext) => ({
      sonarr: context.sonarr ? "connected" : "unavailable",
      radarr: context.radarr ? "connected" : "unavailable",
    }),
  );

  registry.register(checkStatus);

  return registry;
}

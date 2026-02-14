import type { FastifyBaseLogger } from "fastify";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { z } from "zod";
import type { ToolRegistry } from "./tools.js";
import type { ToolCallLoopResult, ToolContext } from "./types.js";

interface ToolCallLoopParams {
  client: OpenAI;
  model: string;
  messages: ChatCompletionMessageParam[];
  registry: ToolRegistry;
  context: ToolContext;
  log: FastifyBaseLogger;
  maxIterations?: number;
}

/**
 * Tool call loop: sends messages to the LLM, processes tool calls,
 * validates arguments, executes tools, and re-prompts until a final
 * text response or a destructive action requiring confirmation.
 */
export async function toolCallLoop(params: ToolCallLoopParams): Promise<ToolCallLoopResult> {
  const { client, model, messages, registry, context, log, maxIterations = 10 } = params;

  const tools = registry.getDefinitions();

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    log.info({ iteration, messageCount: messages.length }, "Calling LLM");
    const response = await client.chat.completions.create({
      model,
      messages,
      tools,
    });
    log.info({ iteration, finishReason: response.choices[0]?.finish_reason }, "LLM responded");

    const choice = response.choices[0];
    if (!choice) {
      throw new Error("No response choice from LLM");
    }

    const assistantMessage = choice.message;

    log.debug({ response: assistantMessage, iteration }, "LLM response");

    // Push the assistant message onto messages for history tracking
    messages.push(assistantMessage);

    // If no tool calls, return the final text response
    if (choice.finish_reason === "stop" || !assistantMessage.tool_calls?.length) {
      return {
        reply: assistantMessage.content ?? "",
        messagesConsumed: messages,
      };
    }

    // Process each tool call (only function-type tool calls)
    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.type !== "function") {
        continue;
      }

      const functionName = toolCall.function.name;

      // Parse arguments
      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: `Invalid JSON arguments for tool: ${functionName}`,
          }),
        });
        continue;
      }

      // Look up tool in registry
      const tool = registry.get(functionName);
      if (!tool) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: `Unknown tool: ${functionName}` }),
        });
        continue;
      }

      // Validate arguments through the tool's Zod paramSchema
      const validation = (tool.paramSchema as z.ZodType).safeParse(parsedArgs);
      if (!validation.success) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: `Invalid arguments: ${validation.error.message}`,
          }),
        });
        continue;
      }

      // Check confirmation tier: intercept destructive tools before execution
      if (registry.isDestructive(functionName)) {
        const argSummary = Object.entries(parsedArgs as Record<string, unknown>)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join(", ");
        const confirmationPrompt = `I'd like to ${functionName} with ${argSummary || "no arguments"}. Are you sure? (yes/no)`;

        return {
          reply: confirmationPrompt,
          pendingConfirmation: {
            userId: context.userId,
            functionName,
            arguments: JSON.stringify(validation.data),
            promptText: confirmationPrompt,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000),
          },
          messagesConsumed: messages,
        };
      }

      // Execute the tool
      try {
        const result = await tool.execute(validation.data, context);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });

        log.info({ tool: functionName }, "Tool executed");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Tool execution failed";

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: errorMessage }),
        });

        log.error({ tool: functionName, err }, "Tool execution error");
      }
    }

    // Continue loop (re-call LLM with updated messages including tool results)
  }

  // Loop exhausted maxIterations
  return {
    reply: "I'm having trouble processing that. Could you try rephrasing?",
    messagesConsumed: messages,
  };
}

import type {
  ChatCompletionFunctionTool,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

// Re-export OpenAI message type for convenience
export type { ChatCompletionFunctionTool, ChatCompletionMessageParam, ChatCompletionTool };

// Stored message shape (maps to messages table row)
export interface ChatMessage {
  id: number;
  userId: number;
  role: "user" | "assistant" | "tool" | "system";
  content: string | null;
  toolCalls: string | null; // JSON stringified
  toolCallId: string | null;
  name: string | null;
  createdAt: Date;
}

// Confirmation tier classification
export type ConfirmationTier = "safe" | "destructive";

// Tool definition with metadata for registry
export interface ToolDefinition {
  definition: ChatCompletionFunctionTool;
  tier: ConfirmationTier;
  paramSchema: unknown; // Zod schema for argument validation
  execute: (args: unknown, context: ToolContext) => Promise<unknown>;
}

// Context passed to tool executors
export interface ToolContext {
  sonarr?: import("../media/sonarr/sonarr.client.js").SonarrClient;
  radarr?: import("../media/radarr/radarr.client.js").RadarrClient;
  userId: number;
}

// Result from the tool call loop
export interface ToolCallLoopResult {
  reply: string;
  pendingConfirmation?: PendingAction;
  messagesConsumed: ChatCompletionMessageParam[];
}

// Pending destructive action awaiting user confirmation
export interface PendingAction {
  userId: number;
  functionName: string;
  arguments: string; // JSON
  promptText: string;
  expiresAt: Date;
}

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
  groupChatId: string | null; // Phase 16: null = DM, non-null = group chat
  role: "user" | "assistant" | "tool" | "system";
  content: string | null;
  toolCalls: string | null; // JSON stringified
  toolCallId: string | null;
  name: string | null;
  createdAt: Date;
}

// Confirmation tier classification
export type ConfirmationTier = "safe" | "destructive";

// Required role for tool execution
export type RequiredRole = "admin" | "any";

// Tool definition with metadata for registry
export interface ToolDefinition {
  definition: ChatCompletionFunctionTool;
  tier: ConfirmationTier;
  requiredRole: RequiredRole;
  paramSchema: unknown; // Zod schema for argument validation
  execute: (args: unknown, context: ToolContext) => Promise<unknown>;
}

// Context passed to tool executors
export interface ToolContext {
  sonarr?: import("../media/sonarr/sonarr.client.js").SonarrClient;
  radarr?: import("../media/radarr/radarr.client.js").RadarrClient;
  tmdb?: import("../media/tmdb/tmdb.client.js").TmdbClient;
  brave?: import("../media/brave/brave.client.js").BraveSearchClient;
  plex?: import("../media/plex/plex.client.js").PlexClient;
  tautulli?: import("../media/tautulli/tautulli.client.js").TautulliClient;
  config?: import("../config.js").AppConfig;
  userId: number;
  isAdmin: boolean;
  displayName: string | null;
  replyAddress: string;
  messaging?: import("../messaging/types.js").MessagingProvider;
  /** Optional Telegram provider for cross-provider admin notifications */
  telegramMessaging?: import("../messaging/types.js").MessagingProvider;
  db?: import("drizzle-orm/better-sqlite3").BetterSQLite3Database<typeof import("../db/schema.js")>;
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

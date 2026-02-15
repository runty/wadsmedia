import { and, asc, eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type * as schema from "../db/schema.js";
import { messages } from "../db/schema.js";
import type { ChatMessage } from "./types.js";

type DB = BetterSQLite3Database<typeof schema>;

/**
 * Insert a message row into the messages table.
 */
export function saveMessage(
  db: DB,
  params: {
    userId: number;
    role: "user" | "assistant" | "tool" | "system";
    content: string | null;
    toolCalls?: string | null;
    toolCallId?: string | null;
    name?: string | null;
  },
): ChatMessage {
  return db
    .insert(messages)
    .values({
      userId: params.userId,
      role: params.role,
      content: params.content,
      toolCalls: params.toolCalls ?? null,
      toolCallId: params.toolCallId ?? null,
      name: params.name ?? null,
    })
    .returning()
    .get() as ChatMessage;
}

/**
 * Retrieve the last N messages for a user ordered by createdAt ASC, id ASC.
 * Default limit = 50 (raw retrieval limit, not the LLM window).
 */
export function getHistory(db: DB, userId: number, limit = 50): ChatMessage[] {
  // Subquery to get the most recent N messages, then order ASC
  // Drizzle doesn't have a clean subquery orderBy flip, so we fetch desc then reverse
  // Phase 16: Filter to DM-only messages (groupChatId IS NULL) to prevent group messages leaking in
  const rows = db
    .select()
    .from(messages)
    .where(and(eq(messages.userId, userId), isNull(messages.groupChatId)))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .all();

  // Take the last `limit` rows (oldest first, newest last)
  return rows.slice(-limit) as ChatMessage[];
}

/**
 * Insert a message row into the messages table for a group chat.
 * Like saveMessage but with a groupChatId linking it to shared context.
 * The userId is still recorded for attribution.
 */
export function saveGroupMessage(
  db: DB,
  params: {
    userId: number;
    groupChatId: string;
    role: "user" | "assistant" | "tool" | "system";
    content: string | null;
    toolCalls?: string | null;
    toolCallId?: string | null;
    name?: string | null;
  },
): ChatMessage {
  return db
    .insert(messages)
    .values({
      userId: params.userId,
      groupChatId: params.groupChatId,
      role: params.role,
      content: params.content,
      toolCalls: params.toolCalls ?? null,
      toolCallId: params.toolCallId ?? null,
      name: params.name ?? null,
    })
    .returning()
    .get() as ChatMessage;
}

/**
 * Retrieve the last N messages for a group chat ordered by createdAt ASC, id ASC.
 * Returns shared history across all group members.
 * Default limit = 50 (raw retrieval limit, not the LLM window).
 */
export function getGroupHistory(db: DB, groupChatId: string, limit = 50): ChatMessage[] {
  const rows = db
    .select()
    .from(messages)
    .where(eq(messages.groupChatId, groupChatId))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .all();

  // Take the last `limit` rows (oldest first, newest last)
  return rows.slice(-limit) as ChatMessage[];
}

/**
 * Convert stored ChatMessage rows into OpenAI ChatCompletionMessageParam array
 * with a sliding window that never splits tool call pairs.
 *
 * Algorithm:
 * 1. Start from end of history, work backward counting messages.
 * 2. When encountering a role:"tool" message, find its parent assistant message.
 *    Include the full group (assistant + all tool results).
 * 3. When encountering an assistant message with tool_calls, include all its
 *    corresponding tool result messages.
 * 4. Always start the window at either a "user" message or the very beginning
 *    of a complete tool call sequence.
 * 5. Prepend the system prompt as the first message.
 */
export function buildLLMMessages(
  systemPrompt: string,
  history: ChatMessage[],
  maxMessages = 20,
): ChatCompletionMessageParam[] {
  if (history.length === 0) {
    return [{ role: "system", content: systemPrompt }];
  }

  // Build a set of included indices using the sliding window
  const included = new Set<number>();
  let count = 0;

  for (let i = history.length - 1; i >= 0 && count < maxMessages; i--) {
    if (included.has(i)) {
      continue;
    }

    const msg = history[i] as ChatMessage;

    if (msg.role === "tool") {
      // Include this tool result and find its parent assistant message
      included.add(i);
      count++;

      // Look backward for the parent assistant message with matching tool_calls
      for (let j = i - 1; j >= 0; j--) {
        const candidate = history[j] as ChatMessage;
        if (candidate.role === "assistant" && candidate.toolCalls) {
          if (!included.has(j)) {
            included.add(j);
            count++;
          }
          // Also include all tool results between the assistant and current position
          for (let k = j + 1; k < history.length; k++) {
            const between = history[k] as ChatMessage;
            if (between.role === "tool" && !included.has(k)) {
              // Check if this tool result belongs to the same assistant message
              if (between.toolCallId && candidate.toolCalls) {
                const toolCalls = JSON.parse(candidate.toolCalls) as Array<{
                  id: string;
                }>;
                if (toolCalls.some((tc) => tc.id === between.toolCallId)) {
                  included.add(k);
                  count++;
                }
              }
            } else if (between.role !== "tool") {
              break;
            }
          }
          break;
        }
      }
    } else if (msg.role === "assistant" && msg.toolCalls) {
      // Include assistant message and all its tool results
      included.add(i);
      count++;

      const toolCalls = JSON.parse(msg.toolCalls) as Array<{ id: string }>;
      const toolCallIds = new Set(toolCalls.map((tc) => tc.id));

      // Find all tool results following this assistant message
      for (let k = i + 1; k < history.length; k++) {
        const following = history[k] as ChatMessage;
        if (
          following.role === "tool" &&
          following.toolCallId &&
          toolCallIds.has(following.toolCallId)
        ) {
          if (!included.has(k)) {
            included.add(k);
            count++;
          }
        } else if (following.role !== "tool") {
          break;
        }
      }
    } else {
      // User or plain assistant message
      included.add(i);
      count++;
    }
  }

  // Convert included messages to ChatCompletionMessageParam in order
  const sortedIndices = [...included].sort((a, b) => a - b);

  // Ensure window starts at a user message or the beginning of a tool call sequence
  // (not a lone tool result or bare assistant response mid-conversation)
  const result: ChatCompletionMessageParam[] = [{ role: "system", content: systemPrompt }];

  for (const idx of sortedIndices) {
    const msg = history[idx] as ChatMessage;
    result.push(toCompletionMessage(msg));
  }

  return result;
}

/**
 * Convert a stored ChatMessage to an OpenAI ChatCompletionMessageParam.
 */
function toCompletionMessage(msg: ChatMessage): ChatCompletionMessageParam {
  if (msg.role === "assistant") {
    if (msg.toolCalls) {
      const toolCalls = JSON.parse(msg.toolCalls) as Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
      return {
        role: "assistant",
        content: msg.content ?? null,
        tool_calls: toolCalls,
      };
    }
    return { role: "assistant", content: msg.content ?? "" };
  }

  if (msg.role === "tool") {
    return {
      role: "tool",
      tool_call_id: msg.toolCallId ?? "",
      content: msg.content ?? "",
    };
  }

  // user or system
  return { role: msg.role, content: msg.content ?? "" };
}

/**
 * Delete all messages for a user (utility for future use).
 */
export function clearHistory(db: DB, userId: number): void {
  db.delete(messages).where(eq(messages.userId, userId)).run();
}

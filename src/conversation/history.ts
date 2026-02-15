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
 * Remove consecutive orphaned user messages from conversation history.
 *
 * When multiple user messages appear in a row with no assistant response between
 * them (caused by errors, rapid sends, or history corruption), keep only the
 * LAST user message in each consecutive run. This prevents gpt-4o-mini from
 * producing confused/repetitive responses.
 *
 * Rules:
 * 1. Multiple consecutive user messages -> keep only the last one in the run
 * 2. Tool messages do NOT break a consecutive user run (they belong to their parent assistant)
 * 3. Assistant messages (with or without tool_calls) break a consecutive user run
 * 4. Operates on a copy -- does NOT mutate the input array
 * 5. Empty input returns empty output
 * 6. A single user message is never pruned
 */
export function pruneOrphanedUserMessages(history: ChatMessage[]): ChatMessage[] {
  if (history.length === 0) return [];

  const result: ChatMessage[] = [];

  // Track runs of consecutive user messages (tool messages don't break runs)
  let userRunStart = -1; // index into `history` where current user run began

  for (let i = 0; i < history.length; i++) {
    const msg = history[i] as ChatMessage;

    if (msg.role === "user") {
      if (userRunStart === -1) {
        userRunStart = i;
      }
      // Continue accumulating user messages
    } else if (msg.role === "assistant") {
      // Assistant breaks a user run -- flush it (keep only the last user message)
      if (userRunStart !== -1) {
        // Find the last user message in the run (skip any tool messages in between)
        for (let j = i - 1; j >= userRunStart; j--) {
          if ((history[j] as ChatMessage).role === "user") {
            result.push(history[j] as ChatMessage);
            break;
          }
        }
        userRunStart = -1;
      }
      result.push(msg);
    } else {
      // tool or system messages -- pass through, don't break user run
      if (userRunStart === -1) {
        // Not in a user run, just include the message
        result.push(msg);
      }
      // If in a user run, tool messages are skipped (they're orphaned too,
      // since tool messages should follow an assistant, not be between users)
    }
  }

  // Flush any trailing user run (end of array)
  if (userRunStart !== -1) {
    for (let j = history.length - 1; j >= userRunStart; j--) {
      if ((history[j] as ChatMessage).role === "user") {
        result.push(history[j] as ChatMessage);
        break;
      }
    }
  }

  return result;
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

  // Phase 18: Prune orphaned consecutive user messages before windowing
  // so the LLM never sees fragmented conversation flow and the window
  // budget is not wasted on messages that would confuse the model.
  history = pruneOrphanedUserMessages(history);

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

  const result: ChatCompletionMessageParam[] = [{ role: "system", content: systemPrompt }];

  for (const idx of sortedIndices) {
    const msg = history[idx] as ChatMessage;
    result.push(toCompletionMessage(msg));
  }

  // Sanitize: ensure every tool message has a preceding assistant with matching
  // tool_calls, and every assistant with tool_calls has all its results present.
  // The sliding window or DB-level truncation can orphan tool call sequences.
  return sanitizeToolCallSequences(result);
}

/**
 * Strip orphaned tool messages and assistant messages with incomplete tool results.
 *
 * OpenAI requires:
 * - Every tool message must follow an assistant message whose tool_calls contains
 *   a matching tool_call_id.
 * - Every assistant message with tool_calls must have all corresponding tool
 *   result messages present after it.
 *
 * The sliding window or DB history truncation can violate these rules by cutting
 * in the middle of a tool call sequence. This function drops any messages that
 * would cause a 400 error from the API.
 */
function sanitizeToolCallSequences(
  msgs: ChatCompletionMessageParam[],
): ChatCompletionMessageParam[] {
  // Collect all tool result IDs present in the array
  const presentResultIds = new Set<string>();
  for (const msg of msgs) {
    if (msg.role === "tool") {
      const id = (msg as { tool_call_id?: string }).tool_call_id;
      if (id) presentResultIds.add(id);
    }
  }

  // Forward pass: emit assistant messages with tool_calls only if all their
  // results are present; emit tool messages only if their parent was emitted.
  const emittedToolCallIds = new Set<string>();
  const result: ChatCompletionMessageParam[] = [];

  for (const msg of msgs) {
    if (msg.role === "assistant" && "tool_calls" in msg && msg.tool_calls) {
      const allPresent = msg.tool_calls.every((tc) =>
        presentResultIds.has(tc.id),
      );
      if (allPresent) {
        for (const tc of msg.tool_calls) {
          emittedToolCallIds.add(tc.id);
        }
        result.push(msg);
      }
      // Drop assistant with incomplete tool results (its orphaned tool
      // messages will be caught by the tool-message check below)
    } else if (msg.role === "tool") {
      const toolCallId = (msg as { tool_call_id?: string }).tool_call_id;
      if (toolCallId && emittedToolCallIds.has(toolCallId)) {
        result.push(msg);
      }
      // Drop orphaned tool messages
    } else {
      result.push(msg);
    }
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

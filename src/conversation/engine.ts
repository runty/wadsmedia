import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { FastifyBaseLogger } from "fastify";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AppConfig } from "../config.js";
import type * as schema from "../db/schema.js";
import type { BraveSearchClient } from "../media/brave/brave.client.js";
import type { RadarrClient } from "../media/radarr/radarr.client.js";
import type { SonarrClient } from "../media/sonarr/sonarr.client.js";
import type { TmdbClient } from "../media/tmdb/tmdb.client.js";
import type { MessagingProvider } from "../messaging/types.js";
import {
  clearExpiredActions,
  clearPendingAction,
  getPendingAction,
  isConfirmation,
  isDenial,
  savePendingAction,
} from "./confirmation.js";
import { buildLLMMessages, getHistory, saveMessage } from "./history.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { toolCallLoop } from "./tool-loop.js";
import type { ToolRegistry } from "./tools.js";

type DB = BetterSQLite3Database<typeof schema>;

interface ProcessConversationParams {
  userId: number;
  userPhone: string;
  displayName: string | null;
  isAdmin: boolean;
  messageBody: string;
  db: DB;
  llmClient: OpenAI;
  registry: ToolRegistry;
  sonarr?: SonarrClient;
  radarr?: RadarrClient;
  tmdb?: TmdbClient;
  brave?: BraveSearchClient;
  messaging: MessagingProvider;
  config: AppConfig;
  log: FastifyBaseLogger;
}

/**
 * Top-level conversation orchestrator. This is the main entry point called
 * from the webhook handler for active users.
 *
 * Flow:
 * 1. Clear expired pending actions (opportunistic cleanup)
 * 2. Check for pending confirmation (yes/no/unrelated)
 * 3. Save user message to history
 * 4. Load conversation history
 * 5. Build LLM messages with sliding window
 * 6. Run tool call loop
 * 7. Persist new messages and send reply
 */
export async function processConversation(params: ProcessConversationParams): Promise<void> {
  const {
    userId,
    userPhone,
    displayName,
    isAdmin,
    messageBody,
    db,
    llmClient,
    registry,
    sonarr,
    radarr,
    tmdb,
    brave,
    messaging,
    config,
    log,
  } = params;

  try {
    // 1. Opportunistic cleanup of expired pending actions
    clearExpiredActions(db);

    // 2. Check for pending confirmation
    const pendingAction = getPendingAction(db, userId);
    if (pendingAction) {
      if (isConfirmation(messageBody)) {
        // Execute the confirmed tool
        const tool = registry.get(pendingAction.functionName);
        if (tool) {
          let parsedArgs: unknown;
          try {
            parsedArgs = JSON.parse(pendingAction.arguments);
          } catch {
            parsedArgs = {};
          }

          let resultText: string;
          try {
            const result = await tool.execute(parsedArgs, {
              sonarr,
              radarr,
              tmdb,
              brave,
              config,
              userId,
              isAdmin,
              displayName,
              userPhone,
              messaging,
              db,
            });
            resultText = `Done! ${typeof result === "object" ? JSON.stringify(result) : String(result)}`;
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : "Unknown error";
            resultText = `Sorry, that failed: ${errorMsg}`;
            log.error({ err, tool: pendingAction.functionName }, "Confirmed tool execution failed");
          }

          clearPendingAction(db, userId);

          // Save user message ("yes") and assistant reply to history
          saveMessage(db, { userId, role: "user", content: messageBody });
          saveMessage(db, { userId, role: "assistant", content: resultText });

          await messaging.send({
            to: userPhone,
            body: resultText,
            from: config.TWILIO_PHONE_NUMBER,
          });
        } else {
          // Tool no longer registered -- clear and inform
          clearPendingAction(db, userId);
          const errorText = "Sorry, that action is no longer available.";
          saveMessage(db, { userId, role: "user", content: messageBody });
          saveMessage(db, { userId, role: "assistant", content: errorText });
          await messaging.send({
            to: userPhone,
            body: errorText,
            from: config.TWILIO_PHONE_NUMBER,
          });
        }
        return;
      }

      if (isDenial(messageBody)) {
        clearPendingAction(db, userId);
        const cancelText = "OK, cancelled.";
        saveMessage(db, { userId, role: "user", content: messageBody });
        saveMessage(db, { userId, role: "assistant", content: cancelText });
        await messaging.send({
          to: userPhone,
          body: cancelText,
          from: config.TWILIO_PHONE_NUMBER,
        });
        return;
      }

      // Unrelated message -- clear stale pending action and fall through
      clearPendingAction(db, userId);
    }

    // 3. Save the user message to history
    saveMessage(db, { userId, role: "user", content: messageBody });

    // 4. Load conversation history
    const history = getHistory(db, userId);

    // 5. Build LLM messages with sliding window
    const llmMessages = buildLLMMessages(buildSystemPrompt(displayName), history, 20);

    // 6. Run tool call loop
    const result = await toolCallLoop({
      client: llmClient,
      model: config.LLM_MODEL,
      messages: llmMessages,
      registry,
      context: {
        sonarr,
        radarr,
        tmdb,
        brave,
        config,
        userId,
        isAdmin,
        displayName,
        userPhone,
        messaging,
        db,
      },
      log,
    });

    // 7. Persist new messages from the loop
    // The messagesConsumed array contains the system prompt + history + new messages.
    // New messages start after the messages we loaded from history (+ 1 for system prompt).
    // We already saved the user message in step 3, so we need to save messages
    // that were added during the loop (assistant messages with tool calls, tool results,
    // and the final assistant text reply).
    const historyLength = history.length;
    // system prompt is at index 0, then history messages, then new messages from LLM
    const newStartIndex = 1 + historyLength; // skip system + existing history

    for (let i = newStartIndex; i < result.messagesConsumed.length; i++) {
      const msg = result.messagesConsumed[i] as ChatCompletionMessageParam;
      persistLLMMessage(db, userId, msg);
    }

    // Save pending confirmation if any
    if (result.pendingConfirmation) {
      savePendingAction(db, result.pendingConfirmation);
    }

    // Send the reply to the user
    log.info({ replyLength: result.reply.length }, "Sending reply via messaging");
    await messaging.send({
      to: userPhone,
      body: result.reply,
      from: config.TWILIO_PHONE_NUMBER,
    });
    log.info("Reply sent");
  } catch (err) {
    log.error({ err, userId }, "Conversation processing error");

    // Send fallback message
    try {
      await messaging.send({
        to: userPhone,
        body: "Sorry, something went wrong. Please try again.",
        from: config.TWILIO_PHONE_NUMBER,
      });
    } catch (sendErr) {
      log.error({ err: sendErr }, "Failed to send fallback error message");
    }
  }
}

/**
 * Persist an LLM message (from the tool call loop) to the messages table.
 */
function persistLLMMessage(db: DB, userId: number, msg: ChatCompletionMessageParam): void {
  if (msg.role === "assistant") {
    const assistantMsg = msg as Extract<ChatCompletionMessageParam, { role: "assistant" }>;
    saveMessage(db, {
      userId,
      role: "assistant",
      content: typeof assistantMsg.content === "string" ? assistantMsg.content : null,
      toolCalls: assistantMsg.tool_calls ? JSON.stringify(assistantMsg.tool_calls) : null,
    });
  } else if (msg.role === "tool") {
    const toolMsg = msg as Extract<ChatCompletionMessageParam, { role: "tool" }>;
    saveMessage(db, {
      userId,
      role: "tool",
      content: typeof toolMsg.content === "string" ? toolMsg.content : null,
      toolCallId: toolMsg.tool_call_id,
    });
  }
  // user and system messages are not expected here (user was saved earlier, system is not persisted)
}

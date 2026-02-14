# Phase 5: Conversation Engine - Research

**Researched:** 2026-02-13
**Domain:** LLM integration, OpenAI-compatible tool calling, conversation persistence, confirmation workflows
**Confidence:** HIGH

## Summary

Phase 5 transforms the placeholder "Conversation features coming soon!" response in `webhook.ts` into a full LLM-powered conversation engine. The engine receives natural language from active users, sends it to a configurable OpenAI-compatible LLM with tool definitions for Sonarr/Radarr operations, persists conversation history per user in SQLite, and requires explicit user confirmation before executing destructive actions.

The project already has `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` config vars defined in `config.ts`. The existing Sonarr/Radarr clients (`fastify.sonarr`, `fastify.radarr`) provide all the media operations. The messaging layer (`fastify.messaging.send()` and TwiML reply formatting) handles outbound communication. The user resolver (`request.user`) provides per-user identity. This phase connects these existing layers through an LLM intermediary.

**Primary recommendation:** Use the official `openai` npm package (v6.x) with manual tool definitions (JSON Schema objects built from Zod v4's native `z.toJSONSchema()`), a hand-written tool call loop (not `runTools`), and a `messages` table in SQLite for conversation history with message-count-based sliding window.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `openai` | ^6.22.0 | OpenAI-compatible chat completions client | Official SDK, supports `baseURL` for Ollama/LMStudio/any provider, TypeScript-native, ESM-compatible |
| `gpt-tokenizer` | ^3.4.0 | Token counting for context window management | Fastest JS tokenizer, supports all OpenAI encodings (o200k_base for GPT-4o), pure JS (no WASM) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-orm` | (existing) | Conversation history persistence | Already in project; add `messages` table to schema |
| `zod` | (existing 4.3.6) | Tool parameter schema definition | Already in project; use `z.toJSONSchema()` for tool param schemas |
| `better-sqlite3` | (existing) | SQLite driver | Already in project; synchronous writes suit single-user-at-a-time pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `openai` SDK | Raw `fetch()` calls | SDK handles retries, types, error classes; raw fetch gives full control but requires more code |
| `openai` SDK `runTools()` | Manual tool call loop | `runTools` auto-executes functions but is opaque, harder to inject confirmation checks, and lives under `client.beta` (unstable API). Manual loop gives full control over confirmation tier, logging, error handling |
| `openai` SDK `zodFunction()` helper | Manual JSON Schema tool defs via `z.toJSONSchema()` | The SDK's zodFunction had Zod v4 compatibility issues (fixed in v5.23.2+ / v6.x but still imports `zod/v3` internally). Using Zod v4's native `z.toJSONSchema()` is cleaner, zero-dependency, and avoids the compatibility layer entirely |
| `gpt-tokenizer` | `tiktoken` (WASM) | `gpt-tokenizer` is pure JS, faster, and has `encodeChat` for message-level counting; `tiktoken` requires WASM binary |
| Message-count sliding window | Token-count sliding window | Token counting is more precise but adds complexity. Start with message count (e.g., last 20 messages), upgrade to token-based if needed |

**Installation:**
```bash
npm install openai gpt-tokenizer
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  conversation/
    llm.ts                # LLM service: OpenAI client wrapper, chat completion calls
    history.ts            # Conversation history: CRUD, sliding window retrieval
    tools.ts              # Tool registry: definitions, parameter schemas, executor map
    tool-loop.ts          # Tool call loop: send -> execute tools -> re-send until text
    confirmation.ts       # Confirmation tier: pending action store, approve/reject
    types.ts              # Shared types: ChatMessage, ToolDefinition, PendingAction
    system-prompt.ts      # System prompt template
  plugins/
    conversation.ts       # Fastify plugin: wires LLM service onto fastify instance
  db/
    schema.ts             # Add: messages table, pending_actions table
```

### Pattern 1: Manual Tool Call Loop
**What:** A while-loop that calls `chat.completions.create()`, checks for tool calls in the response, executes them, appends results as `role: "tool"` messages, and re-calls until `finish_reason === "stop"`.
**When to use:** Always -- this is the core conversation engine pattern.
**Why not runTools:** The SDK's `runTools()` helper auto-executes all tool calls without pause, making it impossible to intercept destructive actions for confirmation. A manual loop lets us check each tool call against the confirmation tier before executing.

```typescript
// Source: OpenAI API docs + OpenAI Cookbook agent example
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";

interface ToolCallLoopResult {
  reply: string;
  pendingConfirmation?: PendingAction;
}

async function toolCallLoop(
  client: OpenAI,
  model: string,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
  toolExecutor: ToolExecutor,
  maxIterations = 10,
): Promise<ToolCallLoopResult> {
  for (let i = 0; i < maxIterations; i++) {
    const response = await client.chat.completions.create({
      model,
      messages,
      tools,
    });

    const choice = response.choices[0];
    if (!choice) throw new Error("No response from LLM");

    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    // If no tool calls, we have a final text response
    if (choice.finish_reason === "stop" || !assistantMessage.tool_calls?.length) {
      return { reply: assistantMessage.content ?? "" };
    }

    // Process each tool call
    for (const toolCall of assistantMessage.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments);

      // Check confirmation tier BEFORE executing
      if (isDestructive(toolCall.function.name)) {
        return {
          reply: formatConfirmationPrompt(toolCall.function.name, args),
          pendingConfirmation: {
            toolCallId: toolCall.id,
            functionName: toolCall.function.name,
            arguments: args,
          },
        };
      }

      // Execute non-destructive tool
      const result = await toolExecutor(toolCall.function.name, args);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  return { reply: "I need to think about that differently. Could you rephrase?" };
}
```

### Pattern 2: Tool Definition with Zod v4 Native JSON Schema
**What:** Define tool parameters as Zod schemas, convert to JSON Schema using `z.toJSONSchema()`, and wrap in the OpenAI tool format.
**When to use:** For every tool definition.

```typescript
// Source: Zod v4 docs (https://zod.dev/json-schema)
import { z } from "zod";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

// Define parameters with Zod (same schemas can validate tool arguments)
const SearchMovieParams = z.object({
  query: z.string().describe("The movie title or search term"),
});

// Convert to OpenAI tool format
function defineTool(
  name: string,
  description: string,
  parameters: z.ZodType,
): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: z.toJSONSchema(parameters, { target: "draft-7" }) as Record<string, unknown>,
    },
  };
}

// Usage
const searchMovieTool = defineTool(
  "search_movies",
  "Search for movies by title. Returns a list of matching movies with year and overview.",
  SearchMovieParams,
);
```

### Pattern 3: Confirmation Tier System
**What:** Tool calls for destructive actions (remove, delete) are intercepted before execution. A pending action is stored, the user is prompted for confirmation, and the next message is checked for approval.
**When to use:** For `removeSeries`, `removeMovie`, and any future delete operations.

```typescript
// Pending action stored in SQLite per user
interface PendingAction {
  userId: number;
  functionName: string;
  arguments: string; // JSON
  promptText: string;
  createdAt: Date;
  expiresAt: Date; // Auto-expire after 5 minutes
}

// On next user message, check if it's a confirmation response
function isConfirmation(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return ["yes", "y", "confirm", "do it", "go ahead", "ok", "sure"].includes(normalized);
}

function isDenial(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  return ["no", "n", "cancel", "stop", "nevermind", "nah"].includes(normalized);
}
```

### Pattern 4: Sliding Context Window
**What:** Store all messages in SQLite. When calling the LLM, retrieve only the last N messages (or messages fitting within a token budget) plus the system prompt.
**When to use:** Every LLM call.

```typescript
// Retrieve windowed conversation for LLM call
function buildLLMMessages(
  systemPrompt: string,
  history: StoredMessage[],
  maxMessages = 20,
): ChatCompletionMessageParam[] {
  const windowed = history.slice(-maxMessages);
  return [
    { role: "system" as const, content: systemPrompt },
    ...windowed.map((m) => ({
      role: m.role as "user" | "assistant" | "tool",
      content: m.content,
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      ...(m.toolCalls ? { tool_calls: JSON.parse(m.toolCalls) } : {}),
    })),
  ];
}
```

### Anti-Patterns to Avoid
- **Storing messages only in memory:** Messages must survive restarts. Always persist to SQLite.
- **Sending entire conversation history to LLM:** Token costs grow unbounded. Use a sliding window.
- **Auto-executing all tool calls (using `runTools`):** Makes it impossible to intercept destructive actions for confirmation. Use a manual loop.
- **Hardcoding tool definitions as raw JSON:** Use Zod schemas to define parameters, then convert to JSON Schema. This ensures the same schema validates tool arguments at runtime.
- **Blocking the Twilio webhook response:** Twilio expects a response within 15 seconds. If LLM + tool execution takes longer, respond immediately with TwiML and send the LLM reply as a separate outbound message via `messaging.send()`.
- **Re-parsing tool arguments from the LLM without validation:** Always validate `JSON.parse(toolCall.function.arguments)` through the Zod schema. LLMs can produce malformed arguments.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAI API client | Custom HTTP client for chat completions | `openai` npm package | Handles auth, retries, streaming, types, error classes, and baseURL for compatible providers |
| Token counting | Character-count heuristic or word-count estimate | `gpt-tokenizer` | BPE tokenization is non-trivial; character count is wildly inaccurate (3-4x error) |
| JSON Schema from Zod | Manual JSON Schema objects | `z.toJSONSchema()` (Zod v4 native) | Eliminates drift between validation schema and tool definition; single source of truth |
| Message serialization | Custom JSON format for conversation storage | OpenAI's `ChatCompletionMessageParam` format | Store messages in the same format the API expects; no transformation needed on retrieval |

**Key insight:** The conversation engine is fundamentally a loop: receive message, load history, call LLM with tools, execute tools or ask for confirmation, store messages, send reply. Every piece of this loop has a proven library or pattern -- the value is in correct orchestration, not novel components.

## Common Pitfalls

### Pitfall 1: Twilio Webhook Timeout
**What goes wrong:** LLM inference + tool execution takes > 15 seconds. Twilio retries the webhook, causing duplicate processing.
**Why it happens:** LLM calls take 2-10 seconds each, and the tool call loop may require multiple rounds. With slow models or network issues, total time easily exceeds Twilio's 15-second limit.
**How to avoid:** Respond to the webhook immediately with an empty TwiML response (`formatEmptyReply()`), then process the LLM call asynchronously and send the reply via `messaging.send()` as a separate outbound message. This decouples webhook response time from LLM processing time.
**Warning signs:** Duplicate messages, "Twilio retry" logs, users receiving the same response multiple times.

### Pitfall 2: Zod v4 vs OpenAI SDK Helper Compatibility
**What goes wrong:** Using `zodFunction()` from `openai/helpers/zod` with Zod v4 may cause runtime errors or incorrect schema generation.
**Why it happens:** The OpenAI SDK's Zod helpers were originally built for Zod v3. While v6.x added v4 support, the helpers internally import from `zod/v3` and use a compatibility layer. Edge cases may produce incorrect JSON schemas.
**How to avoid:** Skip `zodFunction()` entirely. Define Zod schemas, convert to JSON Schema using Zod v4's native `z.toJSONSchema({ target: "draft-7" })`, and construct the OpenAI tool format manually. This is 5 lines of code and eliminates the compatibility concern.
**Warning signs:** "Cannot find module 'zod/v3'" errors, tool call arguments not matching expected schema.

### Pitfall 3: Tool Call Message Format
**What goes wrong:** The conversation history gets corrupted and the LLM produces errors or nonsensical responses.
**Why it happens:** Tool call messages have a specific multi-part format: the assistant message contains `tool_calls` (array), and each tool result is a separate message with `role: "tool"` and `tool_call_id`. If any part is missing or mismatched, the API returns a 400 error.
**How to avoid:** Store the complete assistant message (including `tool_calls` JSON) and each tool result message with its `tool_call_id`. When building the sliding window, ensure tool result messages are never separated from their corresponding assistant tool call message.
**Warning signs:** 400 errors from the chat completions API, messages about "tool_call_id" not matching.

### Pitfall 4: Sliding Window Breaking Tool Call Pairs
**What goes wrong:** The sliding window truncates messages in the middle of a tool call sequence, leaving orphaned `role: "tool"` messages without their parent assistant message (or vice versa).
**Why it happens:** A naive "take last N messages" approach doesn't account for the fact that assistant messages with tool calls and their corresponding tool result messages are semantically linked.
**How to avoid:** When truncating, ensure the window starts at a "clean" boundary -- either a user message or the beginning of a complete tool call sequence (assistant message with tool_calls + all corresponding tool result messages).
**Warning signs:** 400 errors from the API, "messages with role 'tool' must follow a message with tool_calls".

### Pitfall 5: Confirmation State Going Stale
**What goes wrong:** A user triggers a destructive action, gets prompted for confirmation, but then asks something else. The stale pending action remains and could be accidentally confirmed later.
**Why it happens:** No expiration on pending actions, or the confirmation check doesn't clear state when the user sends an unrelated message.
**How to avoid:** Expire pending actions after a short timeout (e.g., 5 minutes). Clear any pending action when the user sends a message that isn't a clear yes/no confirmation. Only one pending action per user at a time.
**Warning signs:** Users accidentally confirming old actions, "phantom" deletions.

### Pitfall 6: OpenAI-Compatible Provider Differences
**What goes wrong:** Tool calling works with OpenAI's API but fails with Ollama/LMStudio.
**Why it happens:** Ollama doesn't support `tool_choice` parameter. Some local models produce malformed tool call arguments. Streaming tool calls may not work the same way.
**How to avoid:** Don't use `tool_choice`. Don't use streaming for tool calls (use non-streaming `create()`). Validate tool call arguments defensively. Log raw LLM responses during development for debugging.
**Warning signs:** Tool calls never triggered, malformed JSON in `function.arguments`, models ignoring tools entirely.

## Code Examples

### OpenAI Client Initialization with Configurable Provider

```typescript
// Source: OpenAI SDK docs, Ollama compatibility docs
import OpenAI from "openai";
import type { AppConfig } from "../config.js";

export function createLLMClient(config: AppConfig): OpenAI {
  return new OpenAI({
    apiKey: config.LLM_API_KEY ?? "not-needed",  // Ollama ignores this
    ...(config.LLM_BASE_URL ? { baseURL: config.LLM_BASE_URL } : {}),
  });
}
```

### Conversation Messages Schema (Drizzle)

```typescript
// Source: Existing project patterns in src/db/schema.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable("messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  role: text("role", { enum: ["user", "assistant", "tool", "system"] }).notNull(),
  content: text("content"),            // Text content (null for assistant msgs with only tool_calls)
  toolCalls: text("tool_calls"),       // JSON stringified tool_calls array (assistant messages only)
  toolCallId: text("tool_call_id"),    // For role:"tool" messages, links to specific tool call
  name: text("name"),                  // Function name for tool messages
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const pendingActions = sqliteTable("pending_actions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  functionName: text("function_name").notNull(),
  arguments: text("arguments").notNull(),  // JSON
  promptText: text("prompt_text").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});
```

### Tool Registry Pattern

```typescript
// Source: Project patterns + OpenAI tool calling docs
import { z } from "zod";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

// Tier classification
type ConfirmationTier = "safe" | "destructive";

interface ToolRegistryEntry {
  definition: ChatCompletionTool;
  tier: ConfirmationTier;
  paramSchema: z.ZodType;
  execute: (args: unknown, context: ToolContext) => Promise<unknown>;
}

interface ToolContext {
  sonarr?: SonarrClient;
  radarr?: RadarrClient;
  userId: number;
}

// Build tool definitions from registry
function getToolDefinitions(registry: Map<string, ToolRegistryEntry>): ChatCompletionTool[] {
  return Array.from(registry.values()).map((entry) => entry.definition);
}
```

### System Prompt Template

```typescript
const SYSTEM_PROMPT = `You are a helpful media management assistant. You help users search for, add, and manage movies and TV shows using Sonarr and Radarr.

Available capabilities:
- Search for movies and TV shows by title
- Check what's in the user's library
- Add movies or shows to the download list
- Remove media (requires user confirmation)
- Check download queue status
- View upcoming episodes and releases

Guidelines:
- Be concise. Users are texting via SMS, so keep responses short.
- When search returns multiple results, present the top 3-5 with enough detail to distinguish them (title, year, overview snippet).
- For add operations, use sensible defaults (first root folder, first quality profile) unless the user specifies otherwise.
- Never execute remove/delete operations without explicit user confirmation.
- If a tool call fails, explain the error simply and suggest next steps.
- Refer to the user by name when available.`;
```

### Webhook Integration Point

```typescript
// In webhook.ts, replace the placeholder response for active users:
if (user.status === "active") {
  // Respond immediately to Twilio (avoid timeout)
  reply.type("text/xml").send(fastify.messaging.formatEmptyReply());

  // Process conversation asynchronously
  processConversation({
    userId: user.id,
    userPhone: user.phone,
    displayName: user.displayName,
    messageBody: message.body,
    db: fastify.db,
    llm: fastify.llm,
    sonarr: fastify.sonarr,
    radarr: fastify.radarr,
    messaging: fastify.messaging,
    config: fastify.config,
    log: request.log,
  }).catch((err) => {
    request.log.error({ err }, "Conversation processing failed");
    // Send error message to user
    fastify.messaging.send({
      to: user.phone,
      body: "Sorry, something went wrong. Please try again.",
      from: fastify.config.TWILIO_PHONE_NUMBER,
    }).catch((sendErr) => {
      request.log.error({ err: sendErr }, "Failed to send error message");
    });
  });

  return;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `functions` parameter in chat completions | `tools` parameter (array of tool objects) | OpenAI API 2023-11 | `functions` is deprecated; always use `tools` |
| `function_call` parameter | `tool_choice` parameter | Same timeframe | Though note: Ollama doesn't support `tool_choice` |
| `role: "function"` in messages | `role: "tool"` with `tool_call_id` | Same timeframe | Tool messages now require a `tool_call_id` linking to the assistant's tool call |
| `client.beta.chat.completions.runTools()` | Still beta, not recommended for production control flow | Ongoing | Use for simple cases only; manual loop preferred when you need control (confirmation, logging) |
| Separate `zod-to-json-schema` library | Zod v4 native `z.toJSONSchema()` | Zod v4 (2025) | Third-party library deprecated Nov 2025; use native |
| OpenAI Responses API | Chat Completions API | 2025 | Responses API is newer but Chat Completions remains the standard for OpenAI-compatible providers (Ollama, LMStudio). Stick with Chat Completions for maximum compatibility |

**Deprecated/outdated:**
- `openai.chat.completions.create({ functions: [...] })` -- use `tools` parameter instead
- `role: "function"` in messages -- use `role: "tool"` with `tool_call_id`
- `zod-to-json-schema` npm package -- deprecated in favor of Zod v4's native `z.toJSONSchema()`
- `zodFunction()` from `openai/helpers/zod` when using Zod v4 -- use manual JSON Schema construction via `z.toJSONSchema()` to avoid compatibility issues

## Open Questions

1. **Token counting accuracy for non-OpenAI models**
   - What we know: `gpt-tokenizer` uses OpenAI's tokenizers (cl100k_base, o200k_base). These are accurate for OpenAI models.
   - What's unclear: Local models (Llama, Mistral) use different tokenizers. Token counts will be approximate.
   - Recommendation: Use message-count-based windowing as the primary strategy. Token counting can be a secondary safety check. This avoids the model-specific tokenizer problem entirely.

2. **Twilio webhook response strategy**
   - What we know: Twilio has a 15-second timeout. LLM calls + tool execution can take longer. The webhook can respond immediately with empty TwiML and send the reply later via `messaging.send()`.
   - What's unclear: Whether there are rate limits or cost implications of sending as a separate outbound message vs. replying inline.
   - Recommendation: Always respond immediately with empty TwiML and send via `messaging.send()`. This is simpler, avoids all timeout issues, and makes the architecture more resilient. The cost difference is negligible.

3. **LLM provider compatibility breadth**
   - What we know: The OpenAI SDK's `baseURL` works with Ollama (`/v1/`), LMStudio, and any OpenAI-compatible API. Tool calling is supported by Ollama (Llama 3.1+, Mistral, Qwen2.5) and most compatible providers.
   - What's unclear: Edge cases in tool call argument formatting across providers. Whether all providers support multiple tool calls in a single response.
   - Recommendation: Build defensively. Validate tool arguments through Zod schemas. Handle single and multiple tool calls. Log raw LLM responses during development. Don't rely on `tool_choice` or `parallel_tool_calls` parameters.

4. **Phase 5 tool scope vs Phase 6/7 tools**
   - What we know: Phase 5 builds the engine (tool calling framework). Phase 6 adds search tools. Phase 7 adds library management tools.
   - What's unclear: Should Phase 5 include any concrete tools, or only the framework?
   - Recommendation: Phase 5 should include the framework AND a minimal set of "hello world" tools (e.g., a simple `get_status` tool that checks Sonarr/Radarr connectivity) to validate the end-to-end flow. The search/add/remove tools are Phase 6/7.

## Sources

### Primary (HIGH confidence)
- [OpenAI Node.js SDK](https://github.com/openai/openai-node) - v6.22.0, ESM support, baseURL configuration, tool calling types
- [OpenAI SDK Zod helpers source](https://github.com/openai/openai-node/blob/master/src/helpers/zod.ts) - Confirmed Zod v3/v4 dual support, zodFunction signature
- [OpenAI SDK helpers.md](https://github.com/openai/openai-node/blob/master/helpers.md) - runTools API, zodFunction, zodResponseFormat usage
- [Ollama OpenAI compatibility docs](https://docs.ollama.com/api/openai-compatibility) - Supported endpoints, tool calling support, `tool_choice` unsupported
- [Zod v4 JSON Schema docs](https://zod.dev/json-schema) - Native `z.toJSONSchema()` function, target options
- [OpenAI Cookbook: Building agents with Node SDK](https://developers.openai.com/cookbook/examples/how_to_build_an_agent_with_the_node_sdk) - Tool call loop pattern, message format

### Secondary (MEDIUM confidence)
- [gpt-tokenizer npm](https://www.npmjs.com/package/gpt-tokenizer) - v3.4.0, encodeChat, countTokens, model support
- [OpenAI function calling guide](https://platform.openai.com/docs/guides/function-calling) - Tool definition format, strict mode, best practices
- [OpenAI Zod v4 compatibility issue #1576](https://github.com/openai/openai-node/issues/1576) - Zod v4 support added in v5.23.2+, compatibility status

### Tertiary (LOW confidence)
- Ollama tool_choice support status -- confirmed unsupported, but behavior may change in future Ollama releases
- Token counting accuracy for non-OpenAI models -- approximate only, as tokenizers differ

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - OpenAI SDK is the de facto standard, well-documented, ESM-compatible, verified v6.22.0
- Architecture: HIGH - Tool call loop pattern is well-established in OpenAI docs and cookbook; confirmed with multiple sources
- Pitfalls: HIGH - Twilio timeout, Zod v4 compat, tool call message format issues are well-documented
- Confirmation tier: MEDIUM - Pattern is sound but specific implementation details (expiry, UX) require iteration

**Research date:** 2026-02-13
**Valid until:** 2026-03-15 (30 days - OpenAI SDK is stable, patterns well-established)

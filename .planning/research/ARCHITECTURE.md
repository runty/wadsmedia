# Architecture Research

**Domain:** Conversational gateway -- messaging-to-API bridge via LLM
**Researched:** 2026-02-13
**Confidence:** MEDIUM (based on training data for established patterns; WebSearch/WebFetch unavailable for latest verification)

## Standard Architecture

### System Overview

```
                            EXTERNAL SERVICES
 ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
 │   Twilio /   │    │  OpenAI-     │    │  Sonarr /    │
 │  Messaging   │    │  Compatible  │    │  Radarr      │
 │  Provider    │    │  LLM API     │    │  Servers     │
 └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
        │                   │                   │
========│===================│===================│==========
        │         WADSMEDIA CONTAINER           │
        │                   │                   │
 ┌──────▼───────┐    ┌──────▼───────┐    ┌──────▼───────┐
 │  Messaging   │    │     LLM      │    │ Media Server │
 │  Provider    │    │   Service    │    │   Client     │
 │  Adapter     │    │              │    │   Layer      │
 └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
        │                   │                   │
 ┌──────▼───────────────────▼───────────────────▼───────┐
 │                   MESSAGE ROUTER                      │
 │          (orchestrates the request lifecycle)          │
 └──────────────────────┬───────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
 ┌──────▼───────┐ ┌─────▼──────┐ ┌─────▼──────┐
 │ Conversation │ │   User     │ │Notification│
 │   Store      │ │  Manager   │ │  Service   │
 └──────────────┘ └────────────┘ └────────────┘
        │               │               │
 ┌──────▼───────────────▼───────────────▼───────┐
 │                  DATA LAYER                   │
 │              (SQLite via file)                 │
 └───────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Messaging Provider Adapter** | Receives webhooks from messaging services, normalizes inbound messages to internal format, sends outbound messages via provider API. One adapter per provider. | Express route handler + provider SDK. Interface defines `receiveMessage()` and `sendMessage()`. |
| **Message Router** | Central orchestrator. Receives normalized messages, verifies user authorization, loads conversation history, calls LLM service, dispatches tool calls to media client, returns final response via messaging adapter. | Single async function that sequences the pipeline. No business logic -- only coordination. |
| **LLM Service** | Manages LLM interaction. Builds system prompt, formats conversation history, defines tool/function schemas, sends completion requests, parses tool calls from responses, handles multi-turn tool call loops. | OpenAI SDK with function calling. Stateless -- receives context, returns structured response. |
| **Media Server Client Layer** | Typed API clients for Sonarr and Radarr. Translates tool call parameters into API requests. Returns structured results for LLM consumption. | HTTP client (fetch/axios) wrapping REST endpoints. Separate client class per service (SonarrClient, RadarrClient). |
| **Conversation Store** | Persists per-user message history. Stores user messages, assistant responses, and tool call/result records. Provides history retrieval with configurable depth. | SQLite table with user_id, role, content, tool metadata, timestamp. |
| **User Manager** | Phone number whitelist verification. Maps phone numbers to internal user IDs. Simple authorization gate. | Whitelist loaded from environment variable. Lookup function returns user or rejects. |
| **Notification Service** | Polls Sonarr/Radarr for events (completed downloads, new episodes) or receives webhooks from them. Formats event data into natural language. Pushes messages to users via messaging adapter. | Polling interval or webhook endpoint. Outbound-only -- no LLM involvement needed. |

## Recommended Project Structure

```
src/
├── index.ts                    # App entry point, server startup
├── config.ts                   # Environment variable loading + validation
├── server.ts                   # Express app setup, route mounting
├── router/
│   └── messageRouter.ts        # Central orchestration pipeline
├── messaging/
│   ├── types.ts                # Provider-agnostic message interfaces
│   ├── providerFactory.ts      # Instantiates configured provider adapter
│   └── providers/
│       └── twilio/
│           ├── twilioAdapter.ts    # Twilio-specific webhook + send logic
│           └── twilioWebhook.ts    # Express route for Twilio webhook
├── llm/
│   ├── types.ts                # LLM request/response interfaces
│   ├── llmService.ts           # OpenAI-compatible completion calls
│   ├── systemPrompt.ts         # System prompt construction
│   └── tools/
│       ├── toolRegistry.ts     # Central registry of available tools
│       ├── sonarrTools.ts      # Tool definitions for Sonarr actions
│       └── radarrTools.ts      # Tool definitions for Radarr actions
├── media/
│   ├── types.ts                # Media server response types
│   ├── sonarrClient.ts         # Sonarr API wrapper
│   └── radarrClient.ts         # Radarr API wrapper
├── notifications/
│   ├── notificationService.ts  # Event polling + message dispatch
│   └── formatters.ts           # Event-to-natural-language templates
├── users/
│   └── userManager.ts          # Whitelist, user lookup
├── conversation/
│   ├── conversationStore.ts    # SQLite conversation persistence
│   └── historyBuilder.ts       # Formats history for LLM context window
└── db/
    ├── database.ts             # SQLite connection management
    └── migrations/             # Schema versioning
        └── 001_initial.ts
```

### Structure Rationale

- **`messaging/providers/`:** Each messaging provider lives in its own directory. The adapter interface is defined once in `messaging/types.ts`. Adding a new provider means adding a new directory (e.g., `telegram/`) without touching existing code. The factory pattern in `providerFactory.ts` selects the active adapter from config.
- **`llm/tools/`:** Tool definitions (function schemas + execution handlers) are separated from the LLM service itself. The tool registry aggregates all tools and provides them to the LLM service. This makes adding new *arr service tools trivial.
- **`media/`:** Pure API clients with no LLM awareness. They accept typed parameters and return typed responses. The LLM layer handles translation between natural language and these typed interfaces.
- **`router/`:** The message router is the heart of the system but contains no domain logic. It sequences: authenticate -> load history -> call LLM -> execute tools -> respond. Keeping this thin makes the pipeline easy to test and modify.
- **`conversation/` and `db/`:** Separated from business logic. The conversation store is a thin wrapper over SQLite with methods like `getHistory(userId, limit)` and `addMessage(userId, message)`.

## Architectural Patterns

### Pattern 1: Provider Adapter Pattern (Messaging Layer)

**What:** Define a provider-agnostic interface for messaging. Each concrete provider implements this interface. A factory instantiates the correct adapter at startup.

**When to use:** Always -- this is the core modularity mechanism for supporting multiple messaging services.

**Trade-offs:** Slight indirection cost, but the entire value proposition of "swap providers" depends on it. The interface is small (2-3 methods), so the abstraction cost is negligible.

**Example:**
```typescript
// messaging/types.ts
interface InboundMessage {
  userId: string;          // Provider-specific ID (phone number, chat ID)
  text: string;
  timestamp: Date;
  providerMetadata?: Record<string, unknown>;  // RCS cards, etc.
}

interface OutboundMessage {
  userId: string;
  text: string;
  mediaUrl?: string;       // For image/card responses
}

interface MessagingProvider {
  // Parse incoming webhook into normalized message
  parseWebhook(req: Request): Promise<InboundMessage>;
  // Send a message back to the user
  sendMessage(message: OutboundMessage): Promise<void>;
  // Mount webhook route on Express app
  mountRoutes(app: Express): void;
}

// messaging/providers/twilio/twilioAdapter.ts
class TwilioAdapter implements MessagingProvider {
  async parseWebhook(req: Request): Promise<InboundMessage> {
    // Twilio sends form-encoded body with Body, From, etc.
    return {
      userId: req.body.From,
      text: req.body.Body,
      timestamp: new Date(),
    };
  }

  async sendMessage(message: OutboundMessage): Promise<void> {
    await this.client.messages.create({
      to: message.userId,
      from: this.fromNumber,
      body: message.text,
    });
  }
}
```

### Pattern 2: LLM Tool Call Loop (Intent Resolution)

**What:** Send the user message plus conversation history to the LLM with function/tool definitions. The LLM responds with either a text reply or one or more tool calls. If tool calls are returned, execute them, append the results to the conversation, and call the LLM again. Repeat until the LLM returns a final text response.

**When to use:** Every message processing cycle. This is how the LLM "acts" on the media servers.

**Trade-offs:** Multiple LLM round-trips per user message are possible (adds latency and cost). In practice, most requests resolve in 1-2 tool calls. Cap the loop at a maximum iteration count (e.g., 5) to prevent runaway costs.

**Example:**
```typescript
// llm/llmService.ts
async function processMessage(
  history: ChatMessage[],
  tools: ToolDefinition[]
): Promise<{ response: string; toolCalls: ToolCallRecord[] }> {
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...history,
  ];

  const allToolCalls: ToolCallRecord[] = [];
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (iterations < MAX_ITERATIONS) {
    const completion = await openai.chat.completions.create({
      model: config.llmModel,
      messages,
      tools: tools.map(t => t.schema),
    });

    const choice = completion.choices[0];

    // If LLM returns text, we are done
    if (choice.finish_reason === 'stop') {
      return {
        response: choice.message.content ?? '',
        toolCalls: allToolCalls,
      };
    }

    // If LLM wants to call tools, execute them
    if (choice.message.tool_calls) {
      messages.push(choice.message);  // Add assistant message with tool calls

      for (const toolCall of choice.message.tool_calls) {
        const result = await executeToolCall(toolCall);
        allToolCalls.push({ call: toolCall, result });
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    }

    iterations++;
  }

  return { response: "I had trouble processing that. Please try again.", toolCalls: allToolCalls };
}
```

### Pattern 3: Thin Router / Fat Services

**What:** The message router is a pure orchestration layer. It knows the *sequence* (auth, history, LLM, respond) but delegates all logic to the services. Each service is independently testable.

**When to use:** Always. The router should be < 50 lines of actual logic.

**Trade-offs:** None significant. This is standard pipeline architecture. The only consideration is that error handling lives in the router (catching service failures and returning user-friendly errors).

**Example:**
```typescript
// router/messageRouter.ts
async function handleMessage(
  inbound: InboundMessage,
  provider: MessagingProvider
): Promise<void> {
  // 1. Authorize
  const user = userManager.getUser(inbound.userId);
  if (!user) {
    // Silently drop unauthorized messages (do not reveal system exists)
    return;
  }

  // 2. Load conversation history
  const history = await conversationStore.getHistory(user.id, 50);

  // 3. Add user message to history
  await conversationStore.addMessage(user.id, {
    role: 'user',
    content: inbound.text,
  });

  // 4. Process with LLM
  const { response, toolCalls } = await llmService.processMessage(
    [...history, { role: 'user', content: inbound.text }],
    toolRegistry.getTools()
  );

  // 5. Store assistant response (and tool call records)
  await conversationStore.addMessage(user.id, {
    role: 'assistant',
    content: response,
    toolCalls,
  });

  // 6. Send response back to user
  await provider.sendMessage({
    userId: inbound.userId,
    text: response,
  });
}
```

### Pattern 4: Tool Registry (Extensible Actions)

**What:** A centralized registry where tool definitions (JSON schema for the LLM) and their execution handlers are registered. The LLM service gets tool schemas from the registry. When a tool call comes back, the registry dispatches to the correct handler.

**When to use:** Always. This is how you add Sonarr tools, Radarr tools, and eventually Lidarr/Readarr tools without modifying the LLM service.

**Trade-offs:** Slight indirection. Worth it for extensibility.

**Example:**
```typescript
// llm/tools/toolRegistry.ts
interface Tool {
  schema: ChatCompletionTool;  // OpenAI tool definition
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(name: string, tool: Tool) {
    this.tools.set(name, tool);
  }

  getSchemas(): ChatCompletionTool[] {
    return Array.from(this.tools.values()).map(t => t.schema);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.execute(args);
  }
}

// llm/tools/sonarrTools.ts
function registerSonarrTools(registry: ToolRegistry, sonarr: SonarrClient) {
  registry.register('search_series', {
    schema: {
      type: 'function',
      function: {
        name: 'search_series',
        description: 'Search for a TV series by name',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Series name to search for' }
          },
          required: ['query'],
        },
      },
    },
    execute: async (args) => sonarr.searchSeries(args.query as string),
  });
  // ... more tools
}
```

## Data Flow

### Inbound Message Flow (User sends a text)

```
[User sends text message]
    |
    v
[Messaging Provider (Twilio)]
    | HTTP POST webhook
    v
[Express Webhook Route]
    | req.body parsed
    v
[MessagingProvider.parseWebhook()]
    | InboundMessage { userId, text, timestamp }
    v
[Message Router]
    |
    ├── [UserManager.getUser(userId)]
    |       | Whitelist check: authorized? If no, silent drop.
    |       v
    ├── [ConversationStore.getHistory(userId)]
    |       | Last N messages for context
    |       v
    ├── [ConversationStore.addMessage(userId, userMsg)]
    |       |
    |       v
    ├── [LLMService.processMessage(history, tools)]
    |       |
    |       ├── [LLM API call with tools]
    |       |       | Response: tool_calls or text
    |       |       v
    |       ├── [If tool_calls: ToolRegistry.execute()]
    |       |       |
    |       |       ├── [SonarrClient.method()] or [RadarrClient.method()]
    |       |       |       | HTTP to Sonarr/Radarr API
    |       |       |       v
    |       |       |   Tool result JSON
    |       |       v
    |       ├── [Append tool result, call LLM again]
    |       |       | (loop until text response or max iterations)
    |       |       v
    |       └── Final text response
    |       v
    ├── [ConversationStore.addMessage(userId, assistantMsg)]
    |       v
    └── [MessagingProvider.sendMessage(response)]
            | Twilio API call
            v
        [User receives text message]
```

### Proactive Notification Flow (System notifies user)

```
[Notification Service: polling timer or Sonarr/Radarr webhook]
    |
    ├── [Poll: SonarrClient.getQueue() / RadarrClient.getQueue()]
    |       | Check for completed downloads, new episodes
    |       v
    ├── [Compare with last known state]
    |       | New events detected?
    |       v
    ├── [Formatter: event -> natural language string]
    |       | "Your download of Breaking Bad S01E01 is complete!"
    |       v
    ├── [UserManager: which users should be notified?]
    |       | All whitelisted users, or configurable per-user
    |       v
    └── [MessagingProvider.sendMessage()]
            | Twilio API call (outbound only, no LLM involved)
            v
        [User receives notification]
```

### Key Data Flows

1. **Inbound message processing:** Webhook -> normalize -> authorize -> context load -> LLM + tool loop -> persist -> respond. This is the critical path. Latency budget is dominated by LLM API calls (typically 1-5 seconds per call).
2. **Tool execution within LLM loop:** LLM returns function call -> registry dispatches -> media client makes HTTP request to Sonarr/Radarr -> result returned as JSON string to LLM -> LLM formulates natural language response. Multiple tool calls can happen in sequence within a single user message.
3. **Proactive notifications:** Timer-driven polling (or webhook-driven) -> detect new events -> format -> send to all relevant users. This path bypasses the LLM entirely -- it uses templates, not generation.
4. **Conversation history as LLM context:** Each message cycle loads the last N messages from the store and includes them in the LLM prompt. This enables conversational continuity ("add that one" referring to a show mentioned 3 messages ago). History must include tool calls and results so the LLM understands what actions were taken.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-10 users (target) | Single container, SQLite, polling-based notifications. This is the expected scale for a personal/household media server manager. No optimization needed. |
| 10-50 users | Still single container. SQLite handles this easily. Consider rate limiting on LLM calls if multiple users message simultaneously. Polling interval may need tuning. |
| 50+ users | Would need to swap SQLite for PostgreSQL, add request queuing for LLM calls, and consider separate notification worker. Unlikely scenario for this domain. |

### Scaling Priorities

1. **First bottleneck: LLM API latency and rate limits.** Each inbound message triggers 1-3 LLM API calls. With concurrent users, you hit rate limits. Mitigation: queue messages and process sequentially (acceptable for personal use), or use a local LLM for lower latency.
2. **Second bottleneck: Twilio rate limits.** Twilio has per-number sending limits. For proactive notifications to many users, batch and respect rate limits. At household scale (1-10 users), this is not a concern.
3. **SQLite concurrency.** SQLite handles concurrent reads well but serializes writes. For the expected scale, this is a non-issue. WAL mode ensures reads never block.

## Anti-Patterns

### Anti-Pattern 1: Leaking Provider Details Into Core Logic

**What people do:** Pass raw Twilio request objects through the router and LLM service. Reference `req.body.From` deep inside business logic.
**Why it's wrong:** Makes it impossible to add a second messaging provider without rewriting the core. Every provider has different field names, auth mechanisms, and payload formats.
**Do this instead:** Normalize to `InboundMessage` at the adapter boundary. Everything downstream only sees the internal type. The adapter is the only code that imports the provider SDK.

### Anti-Pattern 2: Embedding Tool Definitions in the LLM Service

**What people do:** Hardcode Sonarr/Radarr function schemas directly in the LLM service module.
**Why it's wrong:** Adding Lidarr or Readarr later requires modifying the LLM service. The LLM service should not know what tools exist -- only that tools exist.
**Do this instead:** Use the tool registry pattern. The LLM service receives tool schemas as input. Tools are registered at startup. Adding new tools means adding a new file in `tools/`, not modifying existing code.

### Anti-Pattern 3: Storing Conversation History as Flat Strings

**What people do:** Store conversation as a single text blob or as simple user/assistant pairs without tool call metadata.
**Why it's wrong:** The LLM needs tool call history to understand what actions were taken. Without it, the LLM cannot reference previous actions ("you added Breaking Bad earlier"). Also, you lose the ability to replay or debug tool executions.
**Do this instead:** Store each message as a structured record with role, content, tool_calls array, and tool_call_id. The history builder reconstructs the full OpenAI-format message array from these records.

### Anti-Pattern 4: Using the LLM for Notifications

**What people do:** Run every notification through the LLM to "make it conversational."
**Why it's wrong:** Notifications are predictable, template-able events. Running them through the LLM wastes money, adds latency, and risks hallucinated content. "Your download of X completed" does not need AI generation.
**Do this instead:** Use simple template strings for notifications. Reserve LLM calls for interpreting ambiguous user input.

### Anti-Pattern 5: No Iteration Cap on Tool Call Loop

**What people do:** Let the LLM call tools indefinitely in a single processing cycle.
**Why it's wrong:** A confused LLM can enter infinite loops (call search, get results, call search again with different query, repeat). Each iteration costs money and time.
**Do this instead:** Cap tool call iterations at 5 (configurable). If exceeded, return a graceful error to the user.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Twilio** | Inbound: Twilio POSTs to webhook URL when user sends message. Outbound: REST API call via Twilio SDK to send message. Auth: Account SID + Auth Token. | Webhook must be publicly accessible (ngrok for dev, reverse proxy for prod). Validate webhook signatures to prevent spoofing. Twilio RCS uses same API as SMS but with richer content support. |
| **OpenAI-compatible LLM** | REST API via OpenAI SDK. Chat completions endpoint with tool/function calling. Auth: API key in header. | Must support tool/function calling. Set `baseURL` to any compatible endpoint (OpenAI, Ollama, LM Studio, OpenRouter, etc.). Model name is configurable. |
| **Sonarr** | REST API. Auth: API key passed as `X-Api-Key` header or `apikey` query parameter. Base URL configurable. | Key endpoints: `/api/v3/series/lookup` (search), `/api/v3/series` (add/list/delete), `/api/v3/calendar` (upcoming), `/api/v3/queue` (downloads). Returns JSON. |
| **Radarr** | REST API. Auth: API key passed as `X-Api-Key` header or `apikey` query parameter. Base URL configurable. | Key endpoints: `/api/v3/movie/lookup` (search), `/api/v3/movie` (add/list/delete), `/api/v3/calendar` (upcoming), `/api/v3/queue` (downloads). Nearly identical structure to Sonarr. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Messaging Adapter <-> Message Router | Direct function call. Adapter calls `handleMessage(inboundMessage)`. | The adapter owns the HTTP/Express layer. The router is a pure function. |
| Message Router <-> LLM Service | Direct function call. Router passes history + tools, gets back response + tool calls. | LLM Service is stateless. All context passed as arguments. |
| LLM Service <-> Tool Registry | Direct function call. LLM Service gets schemas, dispatches executions. | Tool Registry is injected into LLM Service at construction. |
| Tool Registry <-> Media Clients | Direct function call. Tool handlers call client methods. | Media clients are injected into tool registration functions. |
| Message Router <-> Conversation Store | Direct function call. Async read/write to SQLite. | Store exposes simple async methods. No ORM needed at this scale. |
| Notification Service <-> Media Clients | Direct function call. Polls client methods on interval. | Runs on its own timer, independent of message processing. |
| Notification Service <-> Messaging Adapter | Direct function call for outbound messages. | Uses same `sendMessage()` as the request pipeline. |

## Build Order (Dependency Graph)

The following represents the dependency chain and therefore the natural build order for implementation phases:

```
Phase 1: Foundation (no external dependencies)
├── Config loading + validation
├── Express server skeleton
├── SQLite database + migrations
└── Basic types/interfaces

Phase 2: Media Server Clients (depends on: config, types)
├── SonarrClient (HTTP wrapper)
├── RadarrClient (HTTP wrapper)
└── Integration tests against real/mock servers

Phase 3: LLM Layer (depends on: types, media clients)
├── Tool definitions (Sonarr tools, Radarr tools)
├── Tool registry
├── LLM service (OpenAI SDK, tool call loop)
└── System prompt design

Phase 4: Conversation Persistence (depends on: database, types)
├── Conversation store (CRUD for messages)
├── History builder (format for LLM context)
└── Migration for conversation schema

Phase 5: Messaging Provider (depends on: config, types)
├── Provider interface
├── Twilio adapter (webhook + send)
├── Webhook signature validation
└── Provider factory

Phase 6: Message Router (depends on: ALL above)
├── Orchestration pipeline
├── User manager / whitelist
├── Error handling + user-friendly errors
└── End-to-end flow

Phase 7: Notifications (depends on: media clients, messaging provider, user manager)
├── Notification service (polling loop)
├── Event formatters
└── Notification preferences per user

Phase 8: Docker + Deployment (depends on: working application)
├── Dockerfile
├── docker-compose.yml
├── Environment variable documentation
└── Health check endpoint
```

**Build order rationale:**
- Media clients first because they are the simplest external integration and can be tested independently against real Sonarr/Radarr instances.
- LLM layer depends on having tool definitions that wrap media clients, so it comes after.
- Conversation persistence is independent of LLM and media clients; it can be built in parallel with either, but logically pairs with the LLM layer (history feeds into prompts).
- Messaging provider is also independent and can be built in parallel, but comes before the router because the router wires everything together.
- Message router is the last integration point -- it only makes sense once all services exist.
- Notifications are a separate concern that can be deferred without blocking core functionality.
- Docker packaging is the final step.

## Sources

- Sonarr API v3: Based on training data knowledge of Servarr wiki documentation (MEDIUM confidence -- API structure is well-established and stable, but exact endpoint details should be verified against actual Sonarr instance at implementation time)
- Radarr API v3: Same pattern as Sonarr, nearly identical endpoint structure (MEDIUM confidence)
- OpenAI function calling / tool use: Based on training data knowledge of OpenAI API documentation (MEDIUM confidence -- this is a well-documented, stable API pattern, but `tool_choice` and parallel tool call features should be verified against current SDK version)
- Twilio messaging webhooks: Based on training data knowledge of Twilio docs (MEDIUM confidence -- webhook payload format is stable, but RCS-specific features should be verified against current Twilio RCS documentation)
- Conversational gateway patterns: Based on training data knowledge of chatbot/assistant architecture (MEDIUM confidence -- these are established architectural patterns used across many production systems)

**Confidence note:** WebSearch and WebFetch were unavailable during this research session. All findings are based on training data for technologies with well-established, stable APIs and patterns. The architectural patterns described (adapter pattern, tool registry, tool call loop, thin router) are industry-standard and unlikely to have changed. However, specific API endpoint paths, SDK method signatures, and RCS-specific Twilio features should be verified against current documentation during implementation phases.

---
*Architecture research for: WadsMedia -- conversational media server gateway*
*Researched: 2026-02-13*

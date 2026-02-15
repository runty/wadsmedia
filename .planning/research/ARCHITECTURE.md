# Architecture Research: Telegram Bot Integration

**Domain:** Adding Telegram as a second messaging provider to an existing SMS-based media assistant
**Researched:** 2026-02-14
**Confidence:** HIGH (existing codebase analyzed directly; Telegram Bot API verified via official documentation)

## Existing Architecture Baseline

The current system has a clean provider abstraction, but it is phone-centric in ways that go deeper than the MessagingProvider interface alone. Understanding every touch point is critical before designing the Telegram integration.

### Current MessagingProvider Interface

```typescript
// src/messaging/types.ts
interface MessagingProvider {
  send(message: OutboundMessage): Promise<SendResult>;
  validateWebhook(params: { signature: string; url: string; body: Record<string, string> }): boolean;
  parseInbound(body: Record<string, string>): InboundMessage;
  formatReply(text: string): string;
  formatEmptyReply(): string;
}
```

### Phone-Centric Assumptions (Every Place That Must Change)

The codebase assumes phone numbers as the universal identity and routing mechanism in these specific locations:

| Location | What It Does | Phone Dependency |
|----------|-------------|------------------|
| `InboundMessage.from` | Sender identity | Phone number string |
| `OutboundMessage.to` | Recipient address | Phone number string |
| `OutboundMessage.from` | Sender address (Twilio number) | Phone number string |
| `users.phone` column | User lookup key | Phone number, UNIQUE constraint |
| `user-resolver.ts` | Resolves `body.From` to user | Reads phone from Twilio POST body |
| `user.service.ts` | All queries by phone | `findUserByPhone()`, `updateUserStatus()`, etc. |
| `engine.ts` | `userPhone` param, used in send() calls | Phone passed to every `messaging.send()` |
| `engine.ts` lines 133-160 | Sends replies with `from: config.TWILIO_PHONE_NUMBER` | Twilio-specific `from` field |
| `onboarding.ts` | Admin notification with phone | `to: config.ADMIN_PHONE, from: config.TWILIO_PHONE_NUMBER` |
| `add-movie.ts` / `add-series.ts` | Admin notification | `to: config.ADMIN_PHONE, from: config.TWILIO_PHONE_NUMBER` |
| `notify.ts` | Broadcast to all users | Queries `users.phone`, sends with `from: config.TWILIO_PHONE_NUMBER` |
| `ToolContext.userPhone` | Passed to tool executors | Used for admin notifications |
| `config.ts` | `ADMIN_PHONE`, `PHONE_WHITELIST` | Phone-based admin and whitelist |
| `notifications.ts` plugin | Skip if no `TWILIO_PHONE_NUMBER` | Gated on Twilio config |

### What the Engine Actually Needs

Looking at `processConversation()` and the tool loop, the conversation engine itself is **transport-agnostic**. It needs:

1. A `userId` (DB integer) to load/save history
2. A `messageBody` (string) as input
3. A `messaging` provider to send the reply
4. A destination address (currently `userPhone`) for where to send the reply
5. A source address (currently `config.TWILIO_PHONE_NUMBER`) for `from` field

The LLM, tool loop, history, confirmation, and tool execution layers do not care about transport. The coupling is in how messages are sent and how users are resolved.

## Telegram Bot API: Key Facts

Verified against official documentation at https://core.telegram.org/bots/api.

### Update Object Structure

Telegram delivers updates as JSON POST to your webhook URL. Each Update contains exactly one of many optional fields. The ones relevant to WadsMedia:

```typescript
interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;         // User sent a text/photo/etc
  callback_query?: CallbackQuery;    // User tapped an inline keyboard button
  // Many other types (edited_message, channel_post, etc.) -- ignore for now
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;               // Sender (absent in channels)
  chat: TelegramChat;                // Conversation context
  date: number;                      // Unix timestamp
  text?: string;                     // Text message content
  photo?: PhotoSize[];               // Photo message (array of sizes)
  // Many other media types
}

interface TelegramUser {
  id: number;                        // Unique user ID (stable, permanent)
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;                  // @username, optional
}

interface TelegramChat {
  id: number;                        // Chat ID (= user ID for private chats, negative for groups)
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;                    // Group name (absent for private chats)
  first_name?: string;               // For private chats
  username?: string;
}

interface CallbackQuery {
  id: string;                        // Must be answered with answerCallbackQuery
  from: TelegramUser;                // Who tapped the button
  message?: TelegramMessage;         // The message the button was attached to
  data?: string;                     // callback_data from the button (max 64 bytes)
}
```

### Key API Methods Needed

| Method | Purpose | Parameters |
|--------|---------|------------|
| `setWebhook` | Register webhook URL | `url`, `secret_token` (1-256 chars), `allowed_updates` |
| `sendMessage` | Send text reply | `chat_id`, `text`, `parse_mode`, `reply_markup` |
| `sendPhoto` | Send photo with caption | `chat_id`, `photo` (URL or file_id), `caption`, `reply_markup` |
| `answerCallbackQuery` | Acknowledge button tap | `callback_query_id`, `text` (optional toast) |
| `getMe` | Verify bot token | none |

### Critical Differences from Twilio

| Aspect | Twilio (Current) | Telegram |
|--------|-----------------|----------|
| **Identity** | Phone number (E.164 string) | Numeric user ID + numeric chat ID |
| **Webhook body** | URL-encoded form params (`From`, `Body`) | JSON body with nested `Update` object |
| **Webhook auth** | HMAC signature in `X-Twilio-Signature` header | `X-Telegram-Bot-Api-Secret-Token` header (simple string compare) |
| **Reply mechanism** | TwiML XML in response body, or async API call | JSON in response body (one method), or async API call |
| **Message limit** | SMS: 160 chars (auto-chained), MMS: larger | 4096 UTF-8 characters per message |
| **Rich content** | RCS Content Templates (pre-created, Twilio-specific) | Inline keyboards, photos via URL, MarkdownV2/HTML formatting |
| **Sender identity** | `from: TWILIO_PHONE_NUMBER` required | Bot identity is implicit (no `from` needed) |
| **Group context** | N/A (1:1 SMS) | Group chats: `chat.id` is group, `from.id` is user |
| **Button callbacks** | ButtonPayload in same webhook body | Separate `callback_query` update type |
| **Photo sending** | MMS media URLs or Content Templates | `sendPhoto` with URL or file_id |

### Webhook Security

Telegram supports a `secret_token` parameter on `setWebhook`. When set, Telegram includes an `X-Telegram-Bot-Api-Secret-Token` header with every webhook delivery. Validation is a simple string equality check -- no HMAC computation required.

### Direct Reply in Webhook Response

Telegram allows returning a Bot API method call directly in the webhook HTTP response body (as JSON). This avoids a separate API call for the first response. However, this only works for one method per webhook response. Since WadsMedia processes conversations asynchronously (responds with empty/fast, then sends reply later), this is less useful. The async pattern (respond 200, then call sendMessage separately) is the better fit.

### SSL/TLS Requirements

Telegram webhooks require HTTPS on ports 443, 80, 88, or 8443. TLS 1.2 minimum. The existing deployment behind a reverse proxy with SSL termination satisfies this.

## Recommended Architecture

### Strategy: Generalize Identity, Add Provider, New Webhook Route

The integration follows three principles:

1. **Generalize user identity** from phone-only to provider-agnostic addressing
2. **Add TelegramMessagingProvider** implementing the same interface
3. **Add a separate webhook route** for Telegram updates, with its own user resolution

### Architecture Diagram: Multi-Provider System

```
                         EXTERNAL SERVICES
 +----------+  +----------+  +----------+  +----------+
 |  Twilio  |  | Telegram |  | OpenAI-  |  | Sonarr / |
 |  SMS/RCS |  | Bot API  |  | Compat.  |  | Radarr   |
 +----+-----+  +----+-----+  +----+-----+  +----+-----+
      |             |              |              |
======|=============|==============|==============|======
      |       WADSMEDIA CONTAINER                 |
      |             |              |              |
 +----v-----+ +----v------+  +----v-----+  +----v-----+
 | Twilio   | | Telegram  |  |  OpenAI  |  | Sonarr/  |
 | Provider | | Provider  |  |  Client  |  | Radarr   |
 +----+-----+ +----+------+  +----+-----+  +----+-----+
      |             |              |              |
 +----v-------------v--------------v--------------v----+
 |             FASTIFY PLUGIN ARCHITECTURE             |
 |                                                     |
 |  WEBHOOK LAYER (provider-specific)                  |
 |  +----------------+  +-------------------+          |
 |  | POST           |  | POST              |          |
 |  | /webhook/twilio |  | /webhook/telegram |          |
 |  | (form-encoded) |  | (JSON body)       |          |
 |  +-------+--------+  +--------+----------+          |
 |          |                     |                     |
 |          v                     v                     |
 |  +-------+---------------------+--------+           |
 |  |    USER RESOLVER (generalized)       |           |
 |  |    resolve by phone OR chatId        |           |
 |  +------------------+-------------------+           |
 |                     |                               |
 |  CONVERSATION LAYER (transport-agnostic)            |
 |  +------------------v-------------------+           |
 |  | processConversation()                |           |
 |  | - userId (DB int)                    |           |
 |  | - messageBody (string)               |           |
 |  | - replyAddress (string)              |           |
 |  | - messaging (provider instance)      |           |
 |  +--------------------------------------+           |
 +-----------------------------------------------------+
```

### Component Boundaries

| Component | Responsibility | New/Modified | Communicates With |
|-----------|---------------|--------------|-------------------|
| **TelegramMessagingProvider** | Implement MessagingProvider for Telegram Bot API. Send messages via sendMessage/sendPhoto. Validate webhook via secret_token. Parse Update JSON into InboundMessage. | NEW | Telegram Bot API, webhook route |
| **Telegram webhook route** | POST /webhook/telegram. Validate secret_token header. Dispatch message updates and callback_query updates. Resolve user by Telegram chat ID. | NEW | TelegramMessagingProvider, user resolver, conversation engine |
| **Telegram webhook setup** | On server startup, call setWebhook to register the webhook URL with Telegram. Call getMe to verify the bot token. | NEW | Telegram Bot API |
| **MessagingProvider interface** | Generalized: `formatReply`/`formatEmptyReply` become optional (Telegram does not use TwiML). `validateWebhook` signature changes. | MODIFIED | Both providers |
| **InboundMessage type** | Generalized: `from` becomes a generic string (phone or chatId). Add optional `chatId` and `userId` fields for Telegram context. | MODIFIED | Both webhook routes |
| **OutboundMessage type** | Generalized: `from` becomes optional (Telegram does not need it). `to` becomes chatId string for Telegram. | MODIFIED | Both providers |
| **User model / schema** | Add optional `telegramChatId` column. Users can be identified by phone OR telegramChatId. | MODIFIED | User resolver, user service |
| **User resolver** | Generalized: resolve by phone (Twilio) or by telegramChatId (Telegram). Create pending users from either channel. | MODIFIED | Both webhook routes |
| **processConversation** | Replace `userPhone` with generic `replyAddress`. Remove `from: config.TWILIO_PHONE_NUMBER` hardcoding -- let the provider handle sender identity. | MODIFIED | Conversation engine |
| **Notification dispatch** | Send to all active users across all providers. Users with phone get SMS, users with telegramChatId get Telegram message, users with both get one (configurable). | MODIFIED | All providers, user service |
| **Config** | Add TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_WEBHOOK_URL. | MODIFIED | Telegram plugin |

## Detailed Design: New and Modified Components

### 1. Generalized MessagingProvider Interface

The current interface has Twilio-specific methods (`formatReply` returns TwiML, `validateWebhook` expects HMAC signature params). These need to be generalized.

**Recommended approach:** Evolve the interface to be less Twilio-specific while maintaining backward compatibility.

```typescript
// src/messaging/types.ts -- EVOLVED

export interface InboundMessage {
  messageId: string;          // Was messageSid. Generic message identifier.
  from: string;               // Phone number (Twilio) or chatId (Telegram)
  to: string;                 // Bot's phone/identity
  body: string;               // Text content
  numMedia: number;           // Media attachment count
  buttonPayload: string | null;  // Callback data (Twilio ButtonPayload or Telegram callback_data)
  buttonText: string | null;     // Button display text
  // NEW: Telegram-specific context (optional, null for Twilio)
  telegramUserId?: number;    // The user who sent (distinct from chatId in groups)
  chatType?: "private" | "group" | "supergroup";
}

export interface OutboundMessage {
  to: string;                    // Phone number or chat ID
  body?: string;                 // Plain text message
  contentSid?: string;           // Twilio content template (ignored by Telegram)
  contentVariables?: string;     // Twilio template vars (ignored by Telegram)
  mediaUrl?: string[];           // Twilio MMS / Telegram photo URLs
  messagingServiceSid?: string;  // Twilio-specific (ignored by Telegram)
  from?: string;                 // Twilio-specific sender (ignored by Telegram)
  // NEW: Rich content options (used by Telegram, future Twilio RCS)
  inlineKeyboard?: InlineButton[][];  // Button rows
  parseMode?: "MarkdownV2" | "HTML";  // Telegram formatting
  photo?: string;                     // Single photo URL (Telegram sendPhoto)
}

export interface InlineButton {
  text: string;         // Button label
  callbackData: string; // Data sent back on tap (max 64 bytes for Telegram)
}

export interface SendResult {
  messageId: string;    // Was sid. Generic.
  status: string;
}

export interface MessagingProvider {
  /** Send an outbound message */
  send(message: OutboundMessage): Promise<SendResult>;

  /** Validate an incoming webhook request is authentic */
  validateWebhook(request: WebhookValidationParams): boolean;

  /** Parse raw webhook body into a normalized InboundMessage */
  parseInbound(body: unknown): InboundMessage;

  /** Provider name for logging and routing */
  readonly providerName: string;

  /** Format an immediate webhook response (TwiML for Twilio, null for Telegram) */
  formatWebhookResponse(text?: string): string | null;
}

export interface WebhookValidationParams {
  headers: Record<string, string | string[] | undefined>;
  url: string;
  body: unknown;
}
```

**Key changes:**
- `validateWebhook` takes generic headers/body instead of Twilio-specific params
- `formatReply`/`formatEmptyReply` merged into `formatWebhookResponse` (returns null for providers that do not reply in the webhook response)
- `parseInbound` takes `unknown` instead of `Record<string, string>` (Telegram sends JSON, Twilio sends form-encoded)
- `providerName` added for logging and routing
- `InlineButton` type added for cross-provider button support
- `OutboundMessage` gains `inlineKeyboard`, `parseMode`, `photo` for Telegram rich content

### 2. TelegramMessagingProvider

```typescript
// src/messaging/telegram-provider.ts -- NEW

const TELEGRAM_API = "https://api.telegram.org/bot";

export class TelegramMessagingProvider implements MessagingProvider {
  private botToken: string;
  private webhookSecret: string;
  readonly providerName = "telegram";

  constructor(botToken: string, webhookSecret: string) {
    this.botToken = botToken;
    this.webhookSecret = webhookSecret;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    // If photo is provided, use sendPhoto; otherwise sendMessage
    if (message.photo) {
      return this.sendPhoto(message);
    }
    return this.sendText(message);
  }

  private async sendText(message: OutboundMessage): Promise<SendResult> {
    const payload: Record<string, unknown> = {
      chat_id: message.to,
      text: message.body ?? "",
    };
    if (message.parseMode) payload.parse_mode = message.parseMode;
    if (message.inlineKeyboard) {
      payload.reply_markup = {
        inline_keyboard: message.inlineKeyboard.map(row =>
          row.map(btn => ({ text: btn.text, callback_data: btn.callbackData }))
        ),
      };
    }
    const result = await this.callApi("sendMessage", payload);
    return { messageId: String(result.message_id), status: "sent" };
  }

  private async sendPhoto(message: OutboundMessage): Promise<SendResult> {
    const payload: Record<string, unknown> = {
      chat_id: message.to,
      photo: message.photo,
      caption: message.body,
    };
    if (message.parseMode) payload.parse_mode = message.parseMode;
    if (message.inlineKeyboard) {
      payload.reply_markup = {
        inline_keyboard: message.inlineKeyboard.map(row =>
          row.map(btn => ({ text: btn.text, callback_data: btn.callbackData }))
        ),
      };
    }
    const result = await this.callApi("sendPhoto", payload);
    return { messageId: String(result.message_id), status: "sent" };
  }

  validateWebhook(params: WebhookValidationParams): boolean {
    const token = params.headers["x-telegram-bot-api-secret-token"];
    return token === this.webhookSecret;
  }

  parseInbound(body: unknown): InboundMessage {
    const update = body as TelegramUpdate;

    if (update.callback_query) {
      return this.parseCallbackQuery(update.callback_query);
    }

    if (update.message) {
      return this.parseMessage(update.message);
    }

    // Unsupported update type
    return {
      messageId: String(update.update_id),
      from: "",
      to: "",
      body: "",
      numMedia: 0,
      buttonPayload: null,
      buttonText: null,
    };
  }

  formatWebhookResponse(_text?: string): string | null {
    // Telegram: always return null -- reply via API call, not webhook response
    return null;
  }

  // ... private helper methods
}
```

### 3. Telegram Webhook Route

A new Fastify plugin that handles Telegram updates. Critically different from the Twilio webhook:

- Receives JSON (not form-encoded)
- Must handle two update types: `message` and `callback_query`
- Must call `answerCallbackQuery` for button taps
- Must respond with HTTP 200 quickly (Telegram retries on failure)
- User resolution is by `chat.id` (not phone number)

```typescript
// src/plugins/telegram-webhook.ts -- NEW

export default fp(
  async (fastify: FastifyInstance) => {
    const validateTelegramSecret = async (request: FastifyRequest, reply: FastifyReply) => {
      const secretToken = request.headers["x-telegram-bot-api-secret-token"];
      if (secretToken !== fastify.config.TELEGRAM_WEBHOOK_SECRET) {
        reply.code(403).send({ error: "Invalid secret token" });
        return;
      }
    };

    fastify.post(
      "/webhook/telegram",
      { preHandler: [validateTelegramSecret] },
      async (request, reply) => {
        const update = request.body as TelegramUpdate;

        // Always respond 200 immediately -- process async
        reply.code(200).send({ ok: true });

        if (update.callback_query) {
          // Handle inline keyboard button tap
          await handleCallbackQuery(fastify, update.callback_query, request.log);
          return;
        }

        if (update.message?.text) {
          // Handle text message
          await handleTextMessage(fastify, update.message, request.log);
          return;
        }

        // Ignore other update types (photos, stickers, etc.)
        request.log.debug({ updateId: update.update_id }, "Ignoring non-text Telegram update");
      },
    );
  },
  { name: "telegram-webhook", dependencies: ["database", "telegram-messaging"] },
);
```

### 4. User Identity: Schema Changes

The core challenge: users can contact WadsMedia via SMS (phone number) or Telegram (chat ID). A user might use both. The user model must support this.

**Schema evolution:**

```typescript
// src/db/schema.ts -- MODIFIED

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  phone: text("phone").unique(),              // NOW NULLABLE -- Telegram users may not have a phone
  telegramChatId: text("telegram_chat_id").unique(),  // NEW -- Telegram chat ID as string
  telegramUsername: text("telegram_username"),          // NEW -- optional @username
  displayName: text("display_name"),
  status: text("status", { enum: ["active", "pending", "blocked"] }).notNull().default("pending"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  plexUserId: integer("plex_user_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
```

**Critical decision: phone becomes nullable.** A Telegram-only user has no phone number. The UNIQUE constraint on phone still works (multiple NULLs are allowed in SQLite UNIQUE columns). The `ADMIN_PHONE` config still works for the admin user who uses SMS.

**User lookup generalization:**

```typescript
// src/users/user.service.ts -- MODIFIED

export function findUserByPhone(db: DB, phone: string) { /* unchanged */ }

// NEW
export function findUserByTelegramChatId(db: DB, chatId: string) {
  return db.select().from(users).where(eq(users.telegramChatId, chatId)).get();
}

// NEW: resolve user from either channel
export function findUser(db: DB, identifier: { phone?: string; telegramChatId?: string }) {
  if (identifier.phone) return findUserByPhone(db, identifier.phone);
  if (identifier.telegramChatId) return findUserByTelegramChatId(db, identifier.telegramChatId);
  return undefined;
}
```

### 5. Conversation Engine: Transport Generalization

The `processConversation` function currently takes `userPhone` and hardcodes `from: config.TWILIO_PHONE_NUMBER` in every `messaging.send()` call. This must be generalized.

**Recommended approach:** Replace `userPhone` with `replyAddress` and remove `from` from the engine entirely. Let each provider handle sender identity internally.

```typescript
// src/conversation/engine.ts -- MODIFIED

interface ProcessConversationParams {
  userId: number;
  replyAddress: string;        // Was userPhone. Now: phone number OR chatId
  displayName: string | null;
  isAdmin: boolean;
  messageBody: string;
  // ... db, llmClient, registry, etc. unchanged
  messaging: MessagingProvider;
  config: AppConfig;
  log: FastifyBaseLogger;
}

// In every messaging.send() call, change from:
await messaging.send({
  to: userPhone,
  body: resultText,
  from: config.TWILIO_PHONE_NUMBER,  // REMOVE
});

// To:
await messaging.send({
  to: replyAddress,
  body: resultText,
  // from is handled by provider: Twilio adds it, Telegram ignores it
  ...(config.TWILIO_PHONE_NUMBER ? { from: config.TWILIO_PHONE_NUMBER } : {}),
});
```

**Better approach for `from`:** Move sender identity into the provider instance. The TwilioMessagingProvider constructor already takes credentials -- it can also take the phone number and inject `from` automatically in `send()`. Then the engine never specifies `from`.

```typescript
// TwilioMessagingProvider
constructor(accountSid: string, authToken: string, fromNumber: string) {
  this.fromNumber = fromNumber;
}

async send(message: OutboundMessage): Promise<SendResult> {
  const from = message.from ?? this.fromNumber;  // Default to configured number
  // ... rest unchanged
}

// TelegramMessagingProvider -- from is never needed
async send(message: OutboundMessage): Promise<SendResult> {
  // from is ignored -- bot identity is implicit in the token
}
```

This means the engine can simply:
```typescript
await messaging.send({ to: replyAddress, body: resultText });
```

### 6. ToolContext: Replace userPhone

```typescript
// src/conversation/types.ts -- MODIFIED

export interface ToolContext {
  // ... all existing fields unchanged
  userId: number;
  isAdmin: boolean;
  displayName: string | null;
  replyAddress: string;          // Was userPhone. Generic destination.
  messaging?: MessagingProvider;
  // ... db, config, etc.
}
```

The only tool that uses `userPhone` is the admin notification in `add-movie.ts` and `add-series.ts`. These send to `config.ADMIN_PHONE`, not to the user, so they use the Twilio provider (or whichever provider the admin prefers). This needs a design decision: see "Admin Notification Routing" below.

### 7. Notification Dispatch: Multi-Provider

The current `notifyAllActiveUsers()` queries all active users' phone numbers and sends via the Twilio provider. With Telegram users, this must support both channels.

**Recommended approach:** The notification system queries all active users and sends via the appropriate provider based on what identity the user has.

```typescript
// src/notifications/notify.ts -- MODIFIED

export async function notifyAllActiveUsers(
  db: DB,
  providers: Map<string, MessagingProvider>,  // Was single messaging provider
  config: AppConfig,
  message: string,
  log: FastifyBaseLogger,
): Promise<void> {
  const activeUsers = db
    .select({ phone: users.phone, telegramChatId: users.telegramChatId })
    .from(users)
    .where(eq(users.status, "active"))
    .all();

  for (const user of activeUsers) {
    try {
      if (user.telegramChatId && providers.has("telegram")) {
        await providers.get("telegram")!.send({
          to: user.telegramChatId,
          body: message,
        });
      } else if (user.phone && providers.has("twilio")) {
        await providers.get("twilio")!.send({
          to: user.phone,
          body: message,
          from: config.TWILIO_PHONE_NUMBER,
        });
      }
    } catch (err) {
      log.error({ err, userId: user.phone ?? user.telegramChatId }, "Failed to send notification");
    }
  }
}
```

**Design decision: prefer Telegram for users with both.** If a user has both phone and telegramChatId, prefer Telegram (free, richer, no SMS cost). This preference can be configurable later.

### 8. Group Chat Considerations

Telegram supports group chats where multiple users share one chat. In the current WadsMedia model, conversation history is per-user (keyed by `userId`). Group chats create an interesting design question.

**Recommended approach for MVP: Private chats only.** Ignore group messages. Telegram bots can be configured to not receive group messages via BotFather privacy settings. This avoids the complexity of shared conversation history, multiple users in one thread, and @mention parsing.

**If group support is desired later:**
- `chat.id` identifies the group (negative number)
- `from.id` identifies who sent the message
- History should be keyed by `chatId` (group), not `userId`
- The bot should only respond when mentioned (`@botname`) or in reply
- Permission checks should use `from.id` (the sender), not the group

For now, the webhook route should check `update.message.chat.type === "private"` and ignore group messages.

### 9. Callback Queries (Inline Keyboard Buttons)

Telegram inline keyboards send `callback_query` updates -- a completely separate update type from regular messages. This maps to the existing `buttonPayload` concept in InboundMessage.

**Flow:**
1. Bot sends message with inline keyboard buttons (e.g., "Add this", "Next result", "Check Plex")
2. User taps a button
3. Telegram sends `callback_query` update with `data` field containing the button's `callback_data`
4. Bot must call `answerCallbackQuery` to dismiss the loading state
5. Bot processes the callback as if the user typed the button text

**Implementation:**
```typescript
async function handleCallbackQuery(
  fastify: FastifyInstance,
  query: CallbackQuery,
  log: FastifyBaseLogger,
): Promise<void> {
  const chatId = String(query.message?.chat.id ?? query.from.id);

  // Always answer the callback to dismiss loading indicator
  await fastify.telegramMessaging.answerCallbackQuery(query.id);

  // Resolve user by chatId
  const user = findUserByTelegramChatId(fastify.db, chatId);
  if (!user || user.status !== "active") return;

  // Treat callback_data as a message (e.g., "add_media", "next_result", "check_plex")
  const messageBody = mapCallbackToMessage(query.data ?? "");

  await processConversation({
    userId: user.id,
    replyAddress: chatId,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    messageBody,
    messaging: fastify.telegramMessaging,
    // ... other params
  });
}

function mapCallbackToMessage(callbackData: string): string {
  // Map callback_data to natural language the conversation engine understands
  const mapping: Record<string, string> = {
    "add_media": "Add this",
    "next_result": "Show me the next result",
    "check_plex": "Check if this is in Plex",
  };
  return mapping[callbackData] ?? callbackData;
}
```

### 10. Photo Sending: Telegram vs Twilio

| Feature | Twilio (Current) | Telegram |
|---------|-----------------|----------|
| Send photo | `mediaUrl` in OutboundMessage (MMS) | `sendPhoto` with URL or file_id |
| Photo with caption | Separate body + mediaUrl | `caption` param in sendPhoto |
| Photo with buttons | Not supported in MMS (RCS only) | `reply_markup` with inline keyboard |
| TMDB poster URLs | Works directly with `mediaUrl` | Works directly with `photo` param |

Telegram's photo sending is more capable because you can attach inline keyboard buttons to a photo message. This means search results can be sent as a poster image with "Add this" / "Next" / "Check Plex" buttons -- no Twilio Content Templates needed.

```typescript
// Telegram search result with poster
await telegramProvider.send({
  to: chatId,
  photo: "https://image.tmdb.org/t/p/w500/poster.jpg",
  body: "The Matrix (1999)\nSci-fi classic. 8.7 rating.",  // caption
  parseMode: "MarkdownV2",
  inlineKeyboard: [
    [
      { text: "Add this", callbackData: "add_media:tmdb:603" },
      { text: "Next", callbackData: "next_result" },
    ],
    [
      { text: "Check Plex", callbackData: "check_plex:The Matrix" },
    ],
  ],
});
```

### 11. Admin Notification Routing

When a non-admin user adds media, the admin receives a notification. Currently this goes to `config.ADMIN_PHONE` via Twilio. With Telegram, the admin might prefer Telegram notifications.

**Recommended approach:** Add `ADMIN_TELEGRAM_CHAT_ID` config. If set, admin notifications go to Telegram. If not, fall back to ADMIN_PHONE via Twilio. Support both simultaneously if both are configured.

The admin user record in the DB can have both `phone` and `telegramChatId` set, linking both identities to one user.

### 12. Onboarding Flow for Telegram

The current onboarding flow (src/users/onboarding.ts) is:
1. Unknown phone -> Ask name
2. User provides name -> Notify admin, status pending
3. Admin adds to whitelist -> Status active

For Telegram, the flow is similar but identity comes from chat.id:
1. Unknown chatId -> Ask name (or auto-detect from Telegram first_name)
2. Auto-capture displayName from `message.from.first_name` (Telegram provides this)
3. Notify admin (via their preferred channel) with username and chatId
4. Admin approves via dashboard (or config whitelist)

**Advantage:** Telegram provides `first_name` in every message, so the "ask for name" step can be skipped. The onboarding can be simplified:
1. Unknown chatId -> Create pending user with displayName from `first_name`
2. Notify admin
3. Admin approves

### 13. Webhook Registration on Startup

Unlike Twilio (where you configure the webhook URL in the Twilio dashboard), Telegram webhooks are set via an API call. The server should register the webhook on startup.

```typescript
// src/plugins/telegram-messaging.ts -- NEW

export default fp(
  async (fastify: FastifyInstance) => {
    const { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_WEBHOOK_URL } = fastify.config;
    if (!TELEGRAM_BOT_TOKEN) {
      fastify.log.info("Telegram not configured (TELEGRAM_BOT_TOKEN not set)");
      return;
    }

    const provider = new TelegramMessagingProvider(TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET);
    fastify.decorate("telegramMessaging", provider);

    // Verify bot token
    const botInfo = await provider.getMe();
    fastify.log.info({ botUsername: botInfo.username }, "Telegram bot verified");

    // Register webhook
    if (TELEGRAM_WEBHOOK_URL) {
      await provider.setWebhook(TELEGRAM_WEBHOOK_URL, TELEGRAM_WEBHOOK_SECRET);
      fastify.log.info({ url: TELEGRAM_WEBHOOK_URL }, "Telegram webhook registered");
    }
  },
  { name: "telegram-messaging" },
);
```

### 14. Config Changes

```typescript
// src/config.ts -- MODIFIED

// Telegram (optional)
TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
TELEGRAM_WEBHOOK_SECRET: z.string().min(1).max(256).optional(),
TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
ADMIN_TELEGRAM_CHAT_ID: z.string().optional(),
TELEGRAM_CHAT_ID_WHITELIST: z
  .string()
  .transform((val) => val.split(","))
  .pipe(z.array(z.string().min(1)))
  .optional(),

// ADMIN_PHONE becomes optional (admin might be Telegram-only)
ADMIN_PHONE: z.string().min(1).optional(),  // Was required
```

## Data Flow: Telegram Message Lifecycle

### Text Message Flow

```
[User sends "find sci-fi movies" in Telegram DM]
    |
    v
[Telegram sends POST /webhook/telegram with JSON Update]
    | Headers: X-Telegram-Bot-Api-Secret-Token: <secret>
    | Body: { update_id, message: { chat: { id: 123456, type: "private" },
    |         from: { id: 123456, first_name: "John" }, text: "find sci-fi movies" } }
    v
[Fastify: validate secret_token header]
    |
    v
[Respond HTTP 200 immediately]
    |
    v
[Resolve user: findUserByTelegramChatId(db, "123456")]
    | -> Found: { id: 5, telegramChatId: "123456", status: "active", ... }
    v
[processConversation({
    userId: 5,
    replyAddress: "123456",       // chatId as string
    displayName: "John",
    messageBody: "find sci-fi movies",
    messaging: telegramProvider,   // Telegram-specific provider instance
    ... })]
    |
    v
[LLM + tool loop (unchanged -- transport agnostic)]
    |
    v
[telegramProvider.send({
    to: "123456",
    body: "Here are some sci-fi movies...",
    photo: "https://image.tmdb.org/t/p/w500/...",
    inlineKeyboard: [[{ text: "Add this", callbackData: "add_media:123" }]]
  })]
    |
    v
[Telegram API: POST /bot<token>/sendPhoto]
```

### Callback Query Flow

```
[User taps "Add this" button on search result]
    |
    v
[Telegram sends POST /webhook/telegram with callback_query Update]
    | Body: { update_id, callback_query: { id: "abc123", from: { id: 123456 },
    |         message: { chat: { id: 123456 } }, data: "add_media:603" } }
    v
[Validate secret, respond 200]
    |
    v
[answerCallbackQuery("abc123") -- dismiss loading indicator]
    |
    v
[Extract chatId from callback_query.message.chat.id]
    |
    v
[Resolve user by chatId]
    |
    v
[mapCallbackToMessage("add_media:603") -> "Add this"]
    |
    v
[processConversation({ messageBody: "Add this", ... })]
    | Conversation history has the search results context
    | LLM understands "Add this" refers to the last result
    v
[Bot sends confirmation: "Added The Matrix (1999)!"]
```

## Patterns to Follow

### Pattern 1: Provider Registry

Instead of a single `fastify.messaging` decoration, use a provider map.

```typescript
// src/plugins/messaging.ts -- MODIFIED

declare module "fastify" {
  interface FastifyInstance {
    messaging: MessagingProvider;           // Default provider (backward compat)
    messagingProviders: Map<string, MessagingProvider>;  // All providers
  }
}

// Registration:
const providers = new Map<string, MessagingProvider>();
if (twilioProvider) providers.set("twilio", twilioProvider);
if (telegramProvider) providers.set("telegram", telegramProvider);
fastify.decorate("messagingProviders", providers);
fastify.decorate("messaging", twilioProvider ?? telegramProvider);  // Default
```

This preserves backward compatibility (`fastify.messaging` still works for Twilio-specific code) while enabling multi-provider notification dispatch.

### Pattern 2: Provider-Aware Send Helper

Instead of scattering `from: config.TWILIO_PHONE_NUMBER` throughout the codebase, create a send helper that handles provider differences.

```typescript
// src/messaging/send.ts -- NEW

export async function sendReply(
  provider: MessagingProvider,
  to: string,
  body: string,
  config: AppConfig,
  options?: { photo?: string; inlineKeyboard?: InlineButton[][] },
): Promise<SendResult> {
  return provider.send({
    to,
    body,
    // Twilio needs from; Telegram ignores it
    ...(provider.providerName === "twilio" ? { from: config.TWILIO_PHONE_NUMBER } : {}),
    ...options,
  });
}
```

### Pattern 3: Thin HTTP Client for Telegram API

Follow the existing project pattern of building thin HTTP clients with Zod validation (same as Sonarr, Radarr, TMDB, Plex, Tautulli clients). No SDK -- use native `fetch()`.

```typescript
// Inside TelegramMessagingProvider

private async callApi(method: string, payload: Record<string, unknown>): Promise<any> {
  const response = await fetch(`${TELEGRAM_API}${this.botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Telegram API ${method} failed: ${response.status} ${text}`);
  }

  const data = await response.json() as { ok: boolean; result: any; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram API ${method} error: ${data.description}`);
  }

  return data.result;
}
```

**Rationale for no SDK:** The existing codebase builds all API clients with native fetch + Zod validation. Telegraf and node-telegram-bot-api are full frameworks with their own routing, middleware, and state management. They conflict with the existing Fastify architecture. The Telegram Bot API is simple HTTP JSON -- a thin client with 5-6 methods is all that is needed.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using a Telegram Bot Framework

**What:** Installing telegraf or node-telegram-bot-api
**Why wrong:** These frameworks want to own the HTTP server and routing. They have their own middleware, context objects, and update dispatching. Using them inside Fastify creates two competing systems for handling the same HTTP requests.
**Do instead:** Build a thin HTTP client (5-6 methods) using native `fetch()`. Handle webhook routing in Fastify. This matches the existing pattern for Sonarr, Radarr, TMDB, Plex, and Tautulli clients.

### Anti-Pattern 2: Separate Conversation Histories per Provider

**What:** Keying conversation history by `(userId, provider)` instead of just `userId`
**Why wrong:** If a user switches from SMS to Telegram (or uses both), their conversation context is lost. The LLM loses context about previous searches and additions.
**Do instead:** One user, one history. The user's `id` in the DB is the history key. If the same person contacts via SMS and Telegram, they should be linked to the same user record (manually by admin via dashboard, or automatically if phone number matches).

### Anti-Pattern 3: Processing Telegram Updates Synchronously

**What:** Doing all LLM processing before responding to the Telegram webhook
**Why wrong:** Telegram retries webhooks if it does not get a response quickly. The LLM tool loop can take 5-30 seconds. Telegram will re-send the update, causing duplicate processing.
**Do instead:** Respond HTTP 200 immediately (same pattern as the existing Twilio webhook), then process the conversation asynchronously. Send the reply via a separate `sendMessage` API call.

### Anti-Pattern 4: Sharing One Provider Instance Across Both Webhook Routes

**What:** Using `fastify.messaging` (Twilio) for both SMS and Telegram
**Why wrong:** Each webhook route needs its own provider instance. The Twilio webhook route uses the Twilio provider; the Telegram webhook route uses the Telegram provider. They have different auth, different parsing, different send methods.
**Do instead:** Each webhook route receives the correct provider instance. The provider is determined by the webhook route, not by configuration lookup.

### Anti-Pattern 5: Hardcoding Provider-Specific Logic in the Engine

**What:** Adding `if (provider === "telegram") { ... } else { ... }` in processConversation
**Why wrong:** The conversation engine should be transport-agnostic. Provider differences should be encapsulated in the MessagingProvider implementation.
**Do instead:** The engine calls `messaging.send()` and the provider handles transport-specific details (adding `from` for Twilio, using `sendMessage` vs `sendPhoto` for Telegram, etc.).

## Scalability Considerations

| Concern | Current (SMS only) | With Telegram |
|---------|--------------------|----|
| Message volume | Low (SMS costs limit usage) | Higher (Telegram is free, users message more) |
| Concurrent users | Limited by SMS sending rate | Telegram API: 30 messages/second to different chats |
| Message length | 160 chars (SMS) or 300 chars (MMS trigger) | 4096 chars per message, no cost |
| Rich content | RCS (limited availability) | Inline keyboards + photos (universal) |
| Webhook reliability | Twilio retries, 15-second timeout | Telegram retries on non-200, no strict timeout |
| Group scaling | N/A | One group = many users in one chat (future) |

## Build Order (Dependency-Driven)

```
Wave 1: Interface Generalization
  |- Evolve MessagingProvider interface (generalize)
  |- Evolve InboundMessage/OutboundMessage types
  |- Update TwilioMessagingProvider to new interface (backward compat)
  |- Update conversation engine: userPhone -> replyAddress
  |- Update tool context: userPhone -> replyAddress
  |- Move `from` into TwilioMessagingProvider (encapsulate sender)

  WHY FIRST: Every other change depends on the generalized interface.
  Zero new features -- purely refactoring existing code.

Wave 2: User Identity
  |- Add telegramChatId column to users table (migration)
  |- Make phone nullable (migration)
  |- Add findUserByTelegramChatId to user service
  |- Generalize user resolver to support both identifiers
  |- Add Telegram config vars (TELEGRAM_BOT_TOKEN, etc.)

  WHY SECOND: User resolution must work before any Telegram messages
  can be processed.

Wave 3: Telegram Provider + Webhook
  |- Implement TelegramMessagingProvider (sendMessage, sendPhoto)
  |- Implement webhook validation (secret_token)
  |- Implement parseInbound for message and callback_query
  |- Register Telegram webhook route (POST /webhook/telegram)
  |- Implement setWebhook on startup
  |- Implement answerCallbackQuery
  |- Implement Telegram onboarding (auto displayName from first_name)

  WHY THIRD: This is the core new functionality. Depends on Waves 1 + 2.

Wave 4: Multi-Provider Notifications
  |- Provider registry (Map<string, MessagingProvider>)
  |- Multi-provider notifyAllActiveUsers
  |- Admin notification routing (phone vs telegramChatId)
  |- Update notification plugin to work with both providers

  WHY FOURTH: Depends on provider implementation (Wave 3).

Wave 5: Rich Telegram Features
  |- Inline keyboard buttons on search results
  |- Photo + caption for poster images
  |- Callback query mapping to conversation commands
  |- MarkdownV2 formatting for Telegram messages

  WHY FIFTH: Polish and UX enhancement. Core functionality works without it.
```

## Integration Points Summary

### New Files

| File | Purpose |
|------|---------|
| `src/messaging/telegram-provider.ts` | TelegramMessagingProvider implementation |
| `src/plugins/telegram-messaging.ts` | Fastify plugin: init provider, verify bot, set webhook |
| `src/plugins/telegram-webhook.ts` | Fastify plugin: POST /webhook/telegram route |
| `src/messaging/send.ts` | Provider-aware send helper (optional) |

### Modified Files

| File | What Changes |
|------|-------------|
| `src/messaging/types.ts` | Generalize interfaces (InboundMessage, OutboundMessage, MessagingProvider) |
| `src/messaging/twilio-provider.ts` | Adapt to new interface (backward compatible) |
| `src/db/schema.ts` | Add telegramChatId, make phone nullable |
| `src/users/user.service.ts` | Add findUserByTelegramChatId, generalize lookups |
| `src/users/user.types.ts` | No change (inferred from schema) |
| `src/plugins/user-resolver.ts` | Support Telegram user resolution |
| `src/conversation/engine.ts` | userPhone -> replyAddress, remove hardcoded `from` |
| `src/conversation/types.ts` | ToolContext: userPhone -> replyAddress |
| `src/conversation/tools/add-movie.ts` | Admin notification uses provider, not hardcoded phone |
| `src/conversation/tools/add-series.ts` | Same |
| `src/users/onboarding.ts` | Support Telegram onboarding (auto name, different notification) |
| `src/notifications/notify.ts` | Multi-provider dispatch |
| `src/plugins/notifications.ts` | Work with provider registry |
| `src/plugins/messaging.ts` | Register Twilio as named provider, create provider map |
| `src/config.ts` | Add Telegram config vars, make ADMIN_PHONE optional |
| `src/server.ts` | Register new Telegram plugins |

### Unchanged Files

The following remain completely untouched -- confirming the conversation engine is truly transport-agnostic:

- `src/conversation/tool-loop.ts` (tool execution is identity-agnostic)
- `src/conversation/history.ts` (keyed by userId, not phone)
- `src/conversation/system-prompt.ts` (describes capabilities, not transport)
- `src/conversation/confirmation.ts` (keyed by userId)
- All tool implementations except add-movie/add-series (admin notification)
- All media clients (Sonarr, Radarr, TMDB, Plex, Tautulli)
- Admin dashboard routes

## Sources

- Telegram Bot API official documentation: https://core.telegram.org/bots/api (HIGH confidence)
- Telegram webhook guide: https://core.telegram.org/bots/webhooks (HIGH confidence)
- Telegram Bot FAQ: https://core.telegram.org/bots/faq (HIGH confidence)
- Telegram Bot Tutorial: https://core.telegram.org/bots/tutorial (HIGH confidence)
- Telegram Bot API dialog IDs: https://core.telegram.org/api/bots/ids (HIGH confidence)
- Telegram sendMessage text limit (4096 chars): https://github.com/yagop/node-telegram-bot-api/issues/165 (MEDIUM confidence -- community source, but widely confirmed)
- Existing WadsMedia codebase: Direct analysis of all 63 source files (HIGH confidence)

---
*Architecture research for: WadsMedia -- Telegram Bot Integration*
*Researched: 2026-02-14*

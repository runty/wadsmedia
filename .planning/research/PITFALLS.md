# Pitfalls Research

**Domain:** Adding Telegram bot as a second messaging provider to an existing SMS-based conversational media management system (WadsMedia)
**Researched:** 2026-02-14
**Confidence:** HIGH (verified against Telegram Bot API official documentation, codebase analysis of all affected files, existing v1.0 SMS-only architecture patterns)

---

## Critical Pitfalls

### Pitfall 1: MessagingProvider Interface Is SMS-Shaped, Not Provider-Agnostic

**What goes wrong:**
The current `MessagingProvider` interface in `src/messaging/types.ts` has five deeply SMS-specific methods: `formatReply(text)` returns TwiML XML, `formatEmptyReply()` returns empty TwiML, `validateWebhook()` expects `{signature, url, body}` shaped for Twilio's HMAC-SHA1 validation, `parseInbound()` returns an `InboundMessage` with `messageSid` (Twilio-specific), and `send()` takes an `OutboundMessage` with `contentSid`/`contentVariables`/`messagingServiceSid` (all Twilio-specific fields). A naive approach of implementing `TelegramMessagingProvider` against this interface forces Telegram to speak TwiML, returns fake message SIDs, and ignores Telegram-native features (inline keyboards, MarkdownV2, callback queries) entirely.

The trap is the illusion that the interface is already abstracted. It has a name that sounds generic (`MessagingProvider`), but every field and method signature encodes Twilio assumptions.

**Why it happens:**
The interface was designed for one provider. It feels like it is abstract because it uses `interface` instead of importing Twilio directly. But abstraction requires anticipating variance, and every method was shaped by Twilio's request-reply webhook model: Twilio sends a webhook, you respond with TwiML (synchronous reply), and you send async followups via `client.messages.create()`. Telegram's model is fundamentally different: Telegram sends a webhook with a JSON Update, you respond with HTTP 200 (no reply body needed), and you send messages via `sendMessage` API calls. There is no equivalent to TwiML.

**How to avoid:**
- Do NOT try to make Telegram fit the current interface. Instead, redesign the interface around the actual commonality between SMS and Telegram, which is: "receive a message from a user" and "send a message to a user." The interface should look like:
  ```typescript
  interface MessagingProvider {
    send(message: OutboundMessage): Promise<SendResult>;
    validateWebhook(request: WebhookRequest): boolean;
    parseInbound(request: WebhookRequest): InboundMessage;
  }
  ```
- Remove `formatReply()` and `formatEmptyReply()` from the provider interface entirely. These are Twilio webhook response helpers, not provider-agnostic operations. Move them to a Twilio-specific utility used only by the Twilio webhook route handler.
- Redesign `InboundMessage` to carry provider-agnostic fields: `messageId: string` (not `messageSid`), `senderId: string` (phone number for SMS, Telegram user ID string for Telegram), `chatId: string` (same as senderId for DMs, group chat ID for groups), `text: string` (not `body`), `provider: 'sms' | 'telegram'`. Keep `buttonPayload`/`buttonText` as they map naturally to both RCS suggested replies AND Telegram callback queries.
- Redesign `OutboundMessage` to carry only universal fields (`chatId`, `text`, optional `mediaUrls`) plus a provider-specific extension pattern. Twilio-specific fields like `contentSid`, `messagingServiceSid`, `from` should not leak into the interface.
- The webhook route handler should be provider-specific (separate `/webhook/twilio` and `/webhook/telegram` routes), but they should both produce the same `InboundMessage` shape for the conversation engine.

**Warning signs:**
- `TelegramMessagingProvider.formatReply()` returning empty string or a no-op
- `TelegramMessagingProvider.formatEmptyReply()` returning "OK" or empty string
- `InboundMessage.messageSid` populated with Telegram update_id as a string (square peg, round hole)
- Telegram-native features (inline keyboards, callback queries) implemented as separate code paths that bypass the MessagingProvider entirely
- `OutboundMessage.from` required by the interface but meaningless for Telegram (bots do not have a "from" phone number)

**Phase to address:**
Phase 1 (Provider Interface Refactor) -- this must be the FIRST step before implementing Telegram. Refactoring the interface after building a Telegram provider means rewriting the Telegram provider AND the Twilio provider.

---

### Pitfall 2: User Identity Is Phone-Number-Centric Throughout the Stack

**What goes wrong:**
The entire user model is built around phone numbers as the primary identifier. The `users` table has `phone` as a `UNIQUE NOT NULL` column and no other external identity fields. The user resolver in `src/plugins/user-resolver.ts` extracts `body.From` (a phone number) and calls `findUserByPhone()`. The conversation engine receives `userPhone: string`. The `ToolContext` carries `userPhone: string`. Admin notifications send to `config.ADMIN_PHONE`. The whitelist is `PHONE_WHITELIST`. Onboarding asks "what's your name?" and identifies users by their phone number.

Telegram users are identified by a numeric `user_id` (e.g., `123456789`), not a phone number. A Telegram user may or may not have a username (`@username`). The bot cannot see the user's phone number unless the user explicitly shares it via a Contact sharing permission request. You cannot assume Telegram users have phone numbers or that their phone numbers match their SMS identities.

This creates a fundamental identity problem: if Alice texts via SMS from +15551234567 and also messages via Telegram as user ID 987654321, the system sees two different users with separate conversation histories, separate permissions, and separate pending actions.

**Why it happens:**
Phone numbers were the natural primary key for an SMS-only system. Every SMS message arrives with a `From` phone number. The entire user lifecycle (whitelist, onboard, resolve, track) was built on this invariant. Adding Telegram breaks the invariant because Telegram's identity system is completely independent from phone numbers.

**How to avoid:**
- Add a `telegramUserId` column to the `users` table (nullable `text`, unique when present). This is the Telegram numeric user ID, stored as a string since Telegram user IDs can exceed 32-bit integers.
- Modify the user resolver to support both identity paths: Twilio webhook resolves by phone number (existing), Telegram webhook resolves by Telegram user ID (new). Both paths produce the same `User` record.
- Implement account linking: a Telegram user who is also an SMS user can link accounts. The simplest approach is a `/link` command in Telegram that generates a one-time code, which the user texts via SMS, merging the identities. This is optional and should NOT block basic Telegram functionality.
- For the initial implementation, treat SMS users and Telegram users as separate user populations. A Telegram user goes through their own onboarding (bot sends a welcome message, asks for name, admin approves). The admin whitelist gets a Telegram equivalent (e.g., `TELEGRAM_ALLOWED_USERS` env var with Telegram user IDs or usernames).
- Everywhere the code currently passes `userPhone: string`, introduce a more generic `userAddress: string` or better yet, always pass `userId: number` (the internal database ID) and look up the delivery address from the user record when sending. The `ToolContext.userPhone` field is used for sending replies and admin notifications -- these should reference the user's primary contact channel, not assume a phone number.
- Critically: `config.ADMIN_PHONE` is used for admin notifications. If the admin is on Telegram, admin notifications should go to their Telegram chat. Introduce `ADMIN_CONTACT` that can be either a phone number or Telegram user ID, with a prefix or separate config to distinguish.

**Warning signs:**
- Telegram user IDs being stuffed into the `phone` column (type mismatch, uniqueness collisions)
- `findUserByPhone()` being called with a Telegram user ID
- Two separate user records for the same person (one SMS, one Telegram) with no linking mechanism
- `from: config.TWILIO_PHONE_NUMBER` appearing in Telegram send calls (makes no sense)
- Admin notifications always going via SMS even when the admin primarily uses Telegram

**Phase to address:**
Phase 1 (User Identity Refactor) -- must be designed before implementing the Telegram webhook handler. The schema migration for `telegramUserId` column should be in the first phase.

---

### Pitfall 3: Group Chat Context Collision and Conversation History Pollution

**What goes wrong:**
SMS is inherently 1:1. Every message in the current system creates/retrieves a user, loads that user's conversation history, runs the LLM with that history, and sends a reply. The `messages` table stores history keyed by `userId`. The `pendingActions` table stores one pending action per `userId` (unique constraint). The `getHistory(db, userId)` function loads the last 50 messages for a user.

In a Telegram group chat, multiple users message the bot in the same chat. If Alice asks "search for Breaking Bad" and Bob asks "add that one", whose conversation history does Bob's message land in? Whose search results does "that one" refer to? If the system uses the sender's `userId` for history, each user has their own context even within the same group -- meaning Bob cannot reference Alice's search results. If the system uses the group chat ID for history, all users share one conversation context -- meaning Bob's message could trigger Alice's pending confirmation, and the LLM sees an incoherent interleaving of multiple users' conversations.

The confirmation flow is especially dangerous: `pendingActions` has a unique constraint on `userId`. If Alice triggers a "remove Breaking Bad? yes/no" pending action and Bob (a non-admin) says "yes" in the same group, Bob's message might confirm Alice's destructive action if the system is confused about identity resolution in groups.

**Why it happens:**
1:1 messaging makes user identity synonymous with conversation context. The entire conversation engine assumes one user = one conversation thread. Groups break this fundamental assumption. The `processConversation` function takes a single `userId` and treats it as both the identity for permission checking AND the key for conversation history.

**How to avoid:**
- Separate "sender identity" from "conversation context." A message in a group has both a sender (the Telegram user) and a context (the group chat). The sender determines permissions (isAdmin). The context determines conversation history.
- Introduce a `conversationId` concept separate from `userId`. For SMS and Telegram DMs, `conversationId` equals the user's record (same as today). For Telegram group chats, `conversationId` is derived from the group chat ID. The `messages` table should gain a `conversationId` column (or a separate `conversations` table).
- In group chats, prefix each message in the LLM history with the sender's display name so the LLM knows who said what: "[Alice] search for Breaking Bad" / "[Bob] add that one". This lets the LLM resolve references correctly across users within the same group.
- For pending actions in groups, key by `(conversationId, userId)` pair, not just `userId`. Alice's pending action in a group should only be confirmable by Alice, not by Bob. The confirmation check must verify that the confirming message comes from the same user who triggered the action.
- Apply rate limiting per group: Telegram allows bots to send at most 20 messages per minute per group. If 10 users are active in a group, each conversation response uses part of that budget. Without rate limiting, the bot will start getting 429 errors.
- Decide on a group chat interaction model. Two viable approaches:
  1. **Mention-only:** Bot only responds when @mentioned in groups (Telegram privacy mode default). Simpler, avoids noise, but requires users to type `@botname search for...`.
  2. **All-messages:** Bot receives all group messages (requires disabling privacy mode or making bot admin). More natural but noisier and more expensive (every message in the group triggers LLM processing).
  Recommend: Start with mention-only (default privacy mode). It is simpler, cheaper, and avoids the "bot responds to every message in the group" noise problem.

**Warning signs:**
- Group messages creating separate conversation histories per user (users cannot reference each other's search results)
- OR group messages creating a shared history without sender attribution (LLM cannot tell who said what)
- Bob confirming Alice's pending destructive action in a group
- Bot hitting 20 messages/minute rate limit in active groups
- Group members seeing "Sorry, something went wrong" because the bot exceeded Telegram rate limits

**Phase to address:**
Phase 2 (Group Chat Support) -- this must be a distinct phase after basic Telegram DM support works. Group chat is fundamentally more complex than DMs and should not be mixed into the initial Telegram implementation.

---

### Pitfall 4: Callback Query Timeout and Answer Requirement

**What goes wrong:**
Telegram inline keyboards (for confirmations, search result selection, etc.) send `callback_query` updates when a user taps a button. The critical requirement: the bot MUST call `answerCallbackQuery` for every callback query, even if no visible notification is needed. Until `answerCallbackQuery` is called, the Telegram client displays a spinning progress indicator on the button. If the bot does not answer within approximately 30 seconds, the client shows an error. Users see their button tap "stuck loading" and tap again, potentially triggering duplicate processing.

The current WadsMedia confirmation flow uses text-based yes/no matching (`isConfirmation(messageBody)`). When migrating to inline keyboards, the callback arrives as a `callback_query` update (not a `message` update). If the webhook handler only processes `message` updates and ignores `callback_query` updates, inline keyboard buttons will never work and will always show a spinning indicator.

Furthermore, the current `processConversation` function is fire-and-forget: the webhook handler responds to Twilio immediately with empty TwiML, then processes asynchronously. For Telegram callback queries, you must answer the callback query quickly (within seconds) to stop the loading indicator, but the actual processing (running the LLM, executing tools) may take 5-30 seconds. This requires decoupling the callback acknowledgment from the conversation processing.

**Why it happens:**
SMS has no concept of interactive buttons with server-side acknowledgment. The Twilio model is "receive message, send reply later." Telegram's inline keyboard model requires immediate acknowledgment of button presses separately from the actual response. Developers who treat callback queries like regular messages (process fully before responding) will have buttons that appear broken to users.

**How to avoid:**
- Separate the webhook handler into message handling and callback query handling. The Telegram webhook receives an `Update` object that may contain `message`, `callback_query`, `edited_message`, or other fields. Each type needs different handling.
- For callback queries: immediately call `answerCallbackQuery(callback_query_id)` to dismiss the loading indicator, THEN process the callback data asynchronously. The answer can optionally include a notification text ("Processing your selection...") that appears as a toast at the top of the chat.
- Map callback query data to the existing confirmation/selection flow. The `callback_data` field is limited to 1-64 bytes. Use compact encoding for action data: `confirm:12` for confirming pending action ID 12, `add:m:12345` for adding movie with TMDB ID 12345, `sel:3` for selecting search result #3.
- When sending confirmation prompts, use inline keyboards instead of text-based "yes/no" matching for Telegram. This is better UX and avoids the ambiguity of text-based confirmation (what if the user types "yes" to something else?). Keep text-based confirmation for SMS (no inline keyboards available).
- Track callback query state: callback data persists on the message's buttons until the message is edited or deleted. A user can tap a button hours after it was sent. Ensure stale callback data is handled gracefully (check if the pending action still exists and is not expired).

**Warning signs:**
- Inline keyboard buttons show endless spinning indicator when tapped
- Users tapping buttons multiple times causing duplicate tool executions
- `callback_query` updates being silently dropped by the webhook handler
- Callback data exceeding 64 bytes causing Telegram API errors when sending messages with keyboards
- Stale buttons triggering actions on content that no longer exists

**Phase to address:**
Phase 2 or 3 (Telegram Interactive Features) -- after basic Telegram DM text messaging works. Inline keyboards should be implemented alongside the confirmation flow migration, not as a separate late feature.

---

### Pitfall 5: Webhook Security Model Mismatch (Twilio Signature vs Telegram Secret Token)

**What goes wrong:**
The current webhook validation in `src/plugins/webhook.ts` reconstructs the request URL from `x-forwarded-proto` and `host` headers, then validates the `x-twilio-signature` header against the request body using HMAC-SHA1 with the Twilio auth token. This is Twilio's specific signature scheme where the signature depends on the URL + sorted body parameters.

Telegram uses a completely different security model: when setting up the webhook via `setWebhook`, you provide a `secret_token` (1-256 characters, alphanumeric + underscore + hyphen). Telegram includes this token in every webhook request as the `X-Telegram-Bot-Api-Secret-Token` header. Validation is a simple string comparison (constant-time to avoid timing attacks), not HMAC computation.

The trap is sharing the webhook validation preHandler between Twilio and Telegram. The Twilio validator will reject Telegram requests (no `x-twilio-signature` header). The Telegram validator will reject Twilio requests (no `X-Telegram-Bot-Api-Secret-Token` header). Even if you make them separate, registering both on a single route creates confusion.

**Why it happens:**
The current `validateTwilioSignature` is implemented as a preHandler on the `/webhook/twilio` route, which is correct. But when adding Telegram, the temptation is to create a "generic webhook validation" function that tries both validation methods. This is fragile and creates a security ambiguity where an attacker could bypass validation by triggering the wrong validation path.

**How to avoid:**
- Use completely separate webhook routes: `/webhook/twilio` (existing) and `/webhook/telegram` (new). Each has its own preHandler for validation. No shared validation logic.
- The Telegram webhook route's preHandler should:
  1. Read the `X-Telegram-Bot-Api-Secret-Token` header
  2. Compare against the configured secret token using constant-time comparison (`crypto.timingSafeEqual`)
  3. Reject with 403 if mismatch
- Store the Telegram webhook secret token in config: `TELEGRAM_WEBHOOK_SECRET` env var.
- When calling `setWebhook` via the Telegram Bot API, include the `secret_token` parameter. This should be done once during setup (not on every server start) or idempotently on startup.
- Ensure the Telegram webhook URL uses HTTPS. Telegram requires it. If running behind a reverse proxy (like the existing Twilio webhook), the proxy must terminate SSL and the Telegram webhook URL must be the public HTTPS URL.

**Warning signs:**
- Telegram webhook receiving requests without any validation (no secret token configured)
- Shared webhook route between Twilio and Telegram
- Non-constant-time string comparison for secret token validation (timing attack vulnerability)
- Webhook working locally but failing in production because `setWebhook` was never called with the production URL

**Phase to address:**
Phase 1 (Telegram Webhook Setup) -- webhook security is foundational and must be correct from the first implementation.

---

### Pitfall 6: Message Formatting Divergence (SMS Plain Text vs Telegram MarkdownV2)

**What goes wrong:**
The system prompt explicitly instructs the LLM: "CRITICAL: You are sending SMS text messages. Plain text only -- never use markdown." This is correct for SMS where markdown renders as literal asterisks and brackets. But Telegram natively supports MarkdownV2 formatting. When the same LLM response is sent to Telegram, the user sees plain text that could have been rich (bold titles, italic descriptions, linked text).

Worse: if you enable MarkdownV2 for Telegram, the LLM's response may contain characters that MarkdownV2 treats as special and requires escaping. In MarkdownV2, these characters must be escaped with a backslash: `_`, `*`, `[`, `]`, `(`, `)`, `~`, `` ` ``, `>`, `#`, `+`, `-`, `=`, `|`, `{`, `}`, `.`, `!`. An unescaped `.` or `!` in the LLM response will cause a `400 Bad Request: can't parse entities` error from the Telegram API, and the message silently fails to send.

The system prompt cannot simultaneously instruct "plain text only" for SMS and "use MarkdownV2" for Telegram, since the same system prompt feeds both providers.

**Why it happens:**
The system prompt is static and does not know which provider will deliver the response. The conversation engine generates one reply text that gets routed to whichever provider the user is on. Adding provider-specific formatting requires either (a) formatting after LLM generation or (b) making the system prompt provider-aware.

**How to avoid:**
- Keep the LLM generating plain text (current behavior). Apply formatting as a post-processing step before sending to Telegram:
  - Use `parse_mode: undefined` (no parsing) initially -- plain text works fine in Telegram and avoids all escaping issues. This is the safest starting point.
  - Phase 2 enhancement: build a light formatter that adds bold to titles, italics to years, etc. based on structured data from tool results, not from LLM free-text output. This avoids the escaping minefield.
- If you do use MarkdownV2, build a robust escaping function that escapes all 18+ special characters in any text that was not intentionally formatted. Test it against strings like: `The movie "Inception" (2010) -- 8.8/10! Christopher Nolan's mind-bender.` (contains `.`, `!`, `(`, `)`, `-` which all need escaping).
- NEVER let the LLM generate MarkdownV2 directly. The LLM will produce inconsistent escaping and the Telegram API will reject messages unpredictably. Either format after generation or send as plain text.
- Separate the system prompt's format instructions by provider. When building the system prompt, check the user's provider and append the appropriate formatting guidance. SMS users get "plain text only." Telegram users get "keep it clean, formatting will be applied automatically."
- Handle message splitting differently per provider: SMS is limited to ~300 characters before the system switches to MMS (current `SMS_MAX = 300` in engine.ts). Telegram supports up to 4096 UTF-8 characters per message. The current message splitting logic (`splitForSms`) should not apply to Telegram messages. Telegram messages can be much longer but should still be concise for chat readability.

**Warning signs:**
- `400 Bad Request: can't parse entities` errors in Telegram send logs
- Messages silently failing to send to Telegram users (the error is not surfaced to the user)
- Plain text messages on Telegram that look visually flat compared to other bots
- LLM responses containing markdown that renders as literal `*asterisks*` on SMS after you enable markdown for Telegram

**Phase to address:**
Phase 1 (Basic Telegram Send) -- start with plain text (no `parse_mode`), upgrade to MarkdownV2 as a Phase 2/3 enhancement after basic messaging is stable.

---

### Pitfall 7: Fire-and-Forget Webhook Response Pattern Creates Telegram Retry Storms

**What goes wrong:**
The current Twilio webhook handler in `src/plugins/webhook.ts` uses a fire-and-forget pattern: it responds to Twilio immediately with empty TwiML (`reply.type("text/xml").send(fastify.messaging.formatEmptyReply())`), then runs `processConversation()` asynchronously. If `processConversation()` fails or takes a long time, Twilio does not care -- it already got its 200 response.

Telegram's webhook model is different. Telegram sends an Update and waits for an HTTP response. If the response is not a 200 within a timeout (Telegram documentation says responses must arrive quickly, typically within seconds), Telegram will retry the same update. If your server takes 15 seconds to process a conversation and returns 200 only after processing is complete, Telegram may have already retried, causing the same message to be processed twice.

Conversely, if you respond with 200 immediately (like the current Twilio pattern) but the async processing fails, Telegram considers the update delivered. Unlike Twilio, there is no "retry on failure" -- the update is gone. You lose the message.

If the server crashes or returns 500 during processing, Telegram will retry the update with exponentially increasing intervals. Without deduplication (tracking `update_id`), the retry will be processed as a new message, potentially executing tools or sending duplicate replies.

**Why it happens:**
The fire-and-forget pattern works for Twilio because Twilio's webhook is just a notification mechanism -- Twilio does not expect meaningful responses (the empty TwiML is sufficient). Telegram's webhook IS the delivery mechanism. Responding with 200 means "I received and processed this update." The semantics of the 200 response are different between the two providers.

**How to avoid:**
- Respond to Telegram webhooks with 200 immediately (same fire-and-forget pattern as Twilio). This is actually the correct approach for Telegram too -- responding quickly prevents retries and is recommended by the official documentation. But add update_id deduplication.
- Track the last processed `update_id` per bot. Telegram guarantees sequential update IDs. Before processing an update, check: `if (update.update_id <= lastProcessedUpdateId) return;`. Store `lastProcessedUpdateId` in memory (restart-safe if persisted to SQLite app_metadata table, otherwise just accept re-processing on restart).
- On error during async processing, do NOT re-throw to the webhook handler. The 200 was already sent; let the error be logged and the conversation engine's existing fallback message ("Sorry, something went wrong") handle it. This matches the current Twilio pattern.
- Configure the Telegram webhook with `drop_pending_updates: true` on first setup to avoid processing a backlog of old messages when the bot starts.
- Set `max_connections` in `setWebhook` to limit concurrent webhook deliveries. Default is 40. For a single-server deployment, consider lowering to 5-10 to avoid overwhelming the server with parallel processing.

**Warning signs:**
- Duplicate replies to the same message (retry processing)
- Messages processed twice causing double tool execution (e.g., adding the same movie twice)
- Webhook handler returning 200 only after full conversation processing (blocking for 5-30 seconds)
- Log messages showing the same `update_id` processed multiple times

**Phase to address:**
Phase 1 (Telegram Webhook Handler) -- deduplication must be built into the webhook handler from day one.

---

### Pitfall 8: Hardcoded `config.TWILIO_PHONE_NUMBER` as Send-From Address Throughout the Stack

**What goes wrong:**
The string `from: config.TWILIO_PHONE_NUMBER` appears in at least 8 places across the codebase: `processConversation` (engine.ts lines 132, 136, 143, 147, 157, 161, 234, 248), `notifyAllActiveUsers` (notify.ts line 32), `handleOnboarding` (onboarding.ts lines 59, 63), and `add-movie.ts` (line 135). Every outbound message hardcodes the Twilio phone number as the `from` address.

For Telegram, there is no "from" address. The bot sends messages using its bot token to a `chat_id`. The concept of `from: config.TWILIO_PHONE_NUMBER` is meaningless. If these hardcoded references remain, every send path needs a conditional: "if Telegram, skip the from field; if SMS, include it." This creates scattered provider-awareness throughout the business logic.

**Why it happens:**
Twilio requires a `from` number on every outbound message. It felt natural to include it at the call site rather than in the provider. The `MessagingProvider.send()` method takes `from` as part of `OutboundMessage`, requiring callers to provide it.

**How to avoid:**
- Move `from` out of `OutboundMessage` and into the provider's constructor/config. `TwilioMessagingProvider` should know its own `from` number. The caller should only need to specify `to` (the recipient) and `body` (the content). The provider fills in its own addressing.
- For Telegram, the "from" is implicit: it is always the bot itself. The provider uses the bot token configured during construction.
- Refactor all call sites to remove `from: config.TWILIO_PHONE_NUMBER`. This is a mechanical find-and-replace that should be done atomically with the interface refactor. Every place that currently passes `from` should have that line removed.
- For the `to` field: Twilio uses phone numbers ("+15551234567"), Telegram uses chat IDs ("123456789" or "-100123456789" for groups). The conversation engine should pass the user's delivery address (resolved from the user record) without knowing or caring whether it is a phone number or chat ID.

**Warning signs:**
- `from: config.TWILIO_PHONE_NUMBER` still appearing in new Telegram code paths
- Telegram send calls including a `from` field that gets ignored
- `to` field validation rejecting Telegram chat IDs because it expects phone number format (E.164)
- Admin notification code choosing SMS even when the admin uses Telegram because it only knows `ADMIN_PHONE`

**Phase to address:**
Phase 1 (Provider Interface Refactor) -- must be cleaned up as part of the interface redesign (same phase as Pitfall 1).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Implementing Telegram provider against the current `MessagingProvider` interface without refactoring | Telegram works for basic text messaging with some dummy methods | Every Telegram-native feature (inline keyboards, formatting, callback queries, group chats) requires bypassing the interface. Two code paths for everything. Dead methods like `formatReply()` returning empty strings. | Never -- the interface refactor is prerequisite |
| Storing Telegram user IDs in the `phone` column | No schema migration needed, user resolver works "as-is" | Phone column semantics are destroyed. `findUserByPhone()` now means "find by phone OR telegram ID." Queries expecting E.164 format break. Account linking becomes impossible because phone-based users and telegram-based users occupy the same namespace. | Never -- add `telegramUserId` column |
| Using text-based confirmation ("yes"/"no") for Telegram instead of inline keyboards | Works identically to SMS, zero new code for confirmation flow | Telegram users expect button-based interaction. Text confirmation is ambiguous in groups (anyone can say "yes"). Feels like a legacy SMS experience in a modern chat platform. | Acceptable for MVP/Phase 1 DM-only. Must add inline keyboards before group support. |
| Sharing one system prompt for SMS and Telegram users | Simpler, one prompt to maintain | SMS users told "plain text only" which is correct for SMS but suboptimal for Telegram. Telegram users miss formatting. Or: Telegram formatting instructions confuse the LLM for SMS users. | Acceptable for Phase 1. Add provider-aware prompt section in Phase 2. |
| Single `processConversation` function handling both SMS and Telegram | Reuses the entire conversation engine | Group chat handling, message formatting, confirmation flow, and send addressing all need provider-specific behavior that will accumulate as conditionals inside the function. | Acceptable initially. Extract provider-specific behaviors into strategy objects before group chat support. |
| Ignoring Telegram group chat support entirely | Massively simpler implementation. DM-only is a complete product. | Users who want to share the bot with a household group cannot. Some users will expect group support since it is a primary Telegram feature. | Acceptable for Phase 1 and possibly permanently. Group support is complex and may not be worth the engineering cost for a homelab tool. |
| Not implementing `update_id` deduplication | One less thing to build. Duplicates are rare in practice. | A server restart or slow response causes retries. Duplicate tool executions (adding same movie twice, duplicate admin notifications). Hard to debug because it is intermittent. | Never -- deduplication is simple (one integer comparison) and prevents real data corruption. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Telegram Bot API | Using the bot token in webhook URLs (e.g., `/webhook/telegram/<token>`) for "security" instead of `secret_token` | Use a dedicated `secret_token` via `setWebhook`. The bot token in the URL is a common anti-pattern from old tutorials. If the URL leaks, the bot token is compromised. Use `X-Telegram-Bot-Api-Secret-Token` header validation with a separate secret. |
| Telegram Bot API | Calling `sendMessage` with `parse_mode: "MarkdownV2"` without escaping all special characters in user-generated or LLM-generated text | Default to no `parse_mode` (plain text). Only use MarkdownV2 when you control every character of the message. Build a robust escape function that handles all 18 special characters: `_*[]()~\`>#+-=\|{}.!` |
| Telegram Bot API | Assuming `callback_data` can hold arbitrary strings | `callback_data` is limited to 1-64 bytes. Use compact encoding: short action prefixes + numeric IDs (e.g., `cf:12`, `add:m:9876`). For complex state, store data server-side and use a short key in `callback_data`. |
| Telegram Bot API | Not calling `answerCallbackQuery` for every callback query | ALWAYS call `answerCallbackQuery` immediately, even with empty parameters. The Telegram client shows a loading indicator until this is called. Not calling it makes buttons appear broken. |
| Telegram Bot API | Sending more than 20 messages per minute to a group chat | Implement per-chat rate limiting. Track message count per chat_id with a 60-second sliding window. Queue excess messages and send them after the window resets. For the 30 messages/second global limit, implement a global send queue. |
| Telegram Bot API | Treating group `chat_id` as the `user_id` | A group message has both `message.chat.id` (the group, negative number) and `message.from.id` (the sender). Use `chat_id` for sending replies, `from.id` for user identity/permissions. In DMs, they are the same; in groups, they are different. |
| Telegram Bot API | Expecting the bot to receive all group messages by default | Privacy mode is enabled by default. Bots only receive: commands (/command@botname), replies to the bot's messages, and messages sent via the bot. To receive all messages, either disable privacy mode via BotFather (requires re-adding bot to groups) or make the bot a group admin. |
| Telegram Bot API | Ignoring `edited_message` updates | Users can edit messages after sending. If the original message triggered a search, the edited message might contain a different query. Decide: ignore edits (simpler, recommended) or re-process (complex). Either way, the webhook handler must not crash on `edited_message` updates. |
| Telegram setWebhook | Not setting webhook URL on deployment or after URL changes | The webhook URL must be registered via `setWebhook` API call. It is not automatic. Build a startup health check that verifies the webhook is set correctly, or expose a manual `/admin/setup-telegram-webhook` endpoint. |
| Existing Conversation Engine | Passing `userPhone` through 5 layers of function calls when it should be resolved from `userId` at the send layer | Refactor to pass `userId` through the conversation engine. The send function resolves the delivery address (phone or chat_id) from the user record at send time. This eliminates provider-specific addressing from business logic. |
| Existing Notification System | `notifyAllActiveUsers()` queries all active users and sends via the messaging provider, assuming all users are on the same provider | Split into per-provider notification batches. Query users grouped by provider type. Send SMS notifications via Twilio, Telegram notifications via Telegram bot. Or: have the notification function accept a list of `(userId, provider)` tuples and dispatch accordingly. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| No rate limiting on Telegram sends | 429 "Too Many Requests" errors from Telegram API. `retry_after` field tells you how long to wait. Messages silently dropped if retries are not implemented. | Implement a send queue with rate limiting: 1 message/second per chat (sustained), 30 messages/second global. Use `retry_after` from 429 responses for backoff. | Immediately in active groups (20 msg/min limit), or when sending notifications to 30+ users simultaneously |
| Processing every group message through the LLM | Each message in an active group triggers an LLM API call ($0.01-0.03 per call). A group with 5 active users sending 50 messages/day costs $15-45/month in LLM API calls for one group. | Use mention-only mode in groups (@botname triggers processing, other messages are ignored). Or implement keyword detection before LLM processing. | At 10+ messages/day in a group, or with multiple active groups |
| Synchronous webhook handling blocking Telegram's sequential per-chat delivery | Telegram delivers updates from the same chat sequentially -- it waits for your 200 response before sending the next update from that chat. If processing takes 10 seconds, messages queue up. In DMs this is tolerable (one user waiting). In groups with multiple users, it creates a visible bottleneck. | Respond with 200 immediately, process asynchronously (same fire-and-forget pattern as current Twilio handler). But ensure `answerCallbackQuery` is called before async processing for callback queries. | Immediately in groups with 3+ active users |
| Loading full conversation history for every group message | `getHistory(db, userId)` loads 50 rows per user per message. In a group with 10 users, 10 messages = 500 DB reads. The sliding window LLM context (`buildLLMMessages` with `maxMessages=20`) helps, but the raw retrieval is still 50 rows. | For groups, use a shorter history retrieval limit (20 instead of 50). Consider a group-specific conversation table with TTL-based cleanup. Group conversations are typically shorter-lived than DM conversations. | With 10+ active group members and high message frequency |
| Sending inline keyboards with every response | Each message with an inline keyboard requires tracking button state and handling stale callbacks. If the bot sends 100 messages with keyboards, there are 100 potential callback sources. | Only include inline keyboards when action is expected (confirmation prompts, search result selection). Text-only responses should not have keyboards. Expire keyboard relevance after the next message (edit previous message to remove keyboard). | When users tap buttons from old messages and expect them to still work |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Telegram webhook without `secret_token` validation | Anyone who discovers the webhook URL can send fake updates to your bot, triggering tool executions, impersonating users, or causing data corruption | Always set `secret_token` in `setWebhook` call. Validate `X-Telegram-Bot-Api-Secret-Token` header on every request using `crypto.timingSafeEqual`. Reject with 403 on mismatch. |
| Bot token exposed in logs or error messages | Bot token grants full control of the bot: read messages, send messages, manage groups. Token exposure = complete bot compromise. | Never log the bot token. Use environment variable injection. Sanitize error messages that might include HTTP request URLs (which contain the token for API calls). Rotate token via BotFather if suspected exposure. |
| Telegram user IDs treated as trusted identity without verification | Unlike phone numbers (which Twilio verifies), Telegram user IDs in webhook payloads are only trustworthy if the webhook is properly authenticated. Without `secret_token` validation, an attacker can forge any `from.id`. | The `secret_token` validation (Pitfall 5) is the trust anchor. Once the webhook is authenticated, the `from.id` in the payload is trustworthy because only Telegram can send authenticated webhooks. |
| Allowing any Telegram user to interact with the bot without a whitelist/onboarding | In SMS, only people who know your Twilio number can message you. Telegram bots are publicly discoverable. Anyone can find and message your bot. Without access control, any Telegram user can search your Sonarr/Radarr library, add media, or trigger LLM calls. | Implement the same onboarding flow for Telegram: unknown users get "pending" status, admin approves. Use `TELEGRAM_ALLOWED_USERS` config or a `/start` + admin approval flow. Do NOT assume obscurity protects a Telegram bot. |
| Group chat members automatically gaining access | In SMS, each user messages independently. In a Telegram group, the bot is added once and all members can interact. If the bot processes messages from any group member without checking per-user authorization, a group admin adding the bot gives access to everyone in the group. | Check per-user authorization for every group message, not per-group. The group itself is the conversation context; the sender is the identity. Unapproved users in an approved group should get the onboarding flow, not full access. |
| Not handling `/start` privacy implications | When a user starts a conversation with a bot, the bot receives their Telegram user ID, first name, last name, and username. This is more PII than SMS (which only provides a phone number). | Store only what is needed: user ID (required for sending), display name (for personalization). Do not log or store last names. Document what data the bot collects. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Text-based "yes/no" confirmation on Telegram | Users expect tappable buttons in Telegram bots. Typing "yes" or "no" feels archaic. In groups, text confirmation is ambiguous (whose "yes" is it?). | Use inline keyboards with "Confirm" and "Cancel" buttons for all confirmation flows. Map callback data to the existing `pendingActions` system. Keep text-based confirmation as fallback for SMS only. |
| No typing indicator during LLM processing | User sends message, sees nothing for 5-15 seconds while LLM processes. Feels broken. In SMS, users are accustomed to async replies. In Telegram, users expect immediate feedback. | Call `sendChatAction(chat_id, 'typing')` immediately when a message is received and before starting LLM processing. This shows "bot is typing..." in the Telegram UI. The action expires after 5 seconds, so call it periodically for long operations. |
| Long bot replies that are one giant paragraph | Telegram supports rich formatting (bold, italic, code blocks, links) and multiple messages. Sending a 2000-character plain text wall looks worse in Telegram than in SMS because Telegram users are accustomed to formatted content. | Use Telegram's message length (4096 chars) but break logical sections into shorter messages or use formatting. For search results, consider sending each result as a separate message with its own inline keyboard (add/skip buttons). |
| Bot responding to every message in a group | Non-bot messages in the group trigger processing. Users chatting normally are interrupted by the bot. Group becomes unusable for casual conversation. | Use mention-only mode: bot responds only when @mentioned or when replying to the bot's messages. Use BotFather's privacy mode (default on). Clearly communicate to users: "Mention me to ask for something!" |
| Inline keyboard buttons that stop working after server restart | Callback data references server-side state (pending action IDs) that is lost on restart. User taps a button from 30 minutes ago and gets "unknown action" error. | Store all inline keyboard state in the database (pending actions table already supports this). On callback, look up the action by ID. If expired or missing, edit the message to remove the keyboard and explain: "This action has expired. Please search again." |
| No way to cancel or dismiss inline keyboard prompts | A confirmation keyboard stays on the message forever. If the user does not want to confirm or cancel, it clutters the chat. | Include a "Dismiss" or "Cancel" button. On timeout (5 minutes, matching existing `pendingActions.expiresAt`), edit the message to remove the keyboard. Implement periodic cleanup or check on next message. |
| Search results without visual media (no posters/thumbnails) | SMS cannot include images inline. Telegram can. Users expect search results to include poster images, at least as thumbnails. Without them, the bot feels less capable than browsing TMDB directly. | Send search results as photo messages with captions (poster image + title/year/description) or use `sendPhoto` with inline keyboard buttons. TMDB poster URLs are publicly accessible and can be sent directly via Telegram's `photo` parameter. |

## "Looks Done But Isn't" Checklist

- [ ] **Telegram DM messaging:** Often works for text but `answerCallbackQuery` is not called -- verify by tapping an inline keyboard button and confirming no loading spinner remains
- [ ] **Webhook security:** Often the secret_token is set in code but never passed to `setWebhook` API call -- verify by checking webhook info via `getWebhookInfo` API and confirming `has_custom_certificate` or response payload
- [ ] **Group chat identity:** Often resolves the group chat_id but uses it as user_id for permissions -- verify by having a non-admin user send a message in a group and confirming their individual permission level is checked
- [ ] **Message deduplication:** Often works during normal operation but fails on server restart -- verify by restarting the server while a message is in-flight and confirming no duplicate processing
- [ ] **Rate limiting:** Often works for DMs but not tested for groups -- verify by sending 25+ messages to the bot in a group within one minute and confirming no 429 errors crash the handler
- [ ] **Provider-agnostic conversation engine:** Often the conversation engine works but `config.TWILIO_PHONE_NUMBER` is still hardcoded in send calls -- verify by searching the codebase for `TWILIO_PHONE_NUMBER` in non-Twilio files
- [ ] **Callback data encoding:** Often works for simple cases but exceeds 64 bytes for complex action data -- verify by testing callback data with the longest possible movie title + TMDB ID combination
- [ ] **User onboarding for Telegram:** Often DM onboarding works but group users bypass it -- verify by having an unknown Telegram user send a message in a group the bot is in
- [ ] **Admin notifications routing:** Often notifications go to SMS even when admin is on Telegram -- verify by configuring admin as a Telegram user and confirming notifications arrive via Telegram
- [ ] **Formatted message escaping:** Often MarkdownV2 works for simple text but crashes on LLM responses containing `.`, `!`, `(`, `)`, `-` characters -- verify by triggering a search result response that includes a movie title with parentheses and checking for `400 Bad Request`
- [ ] **Stale inline keyboards:** Often buttons work when fresh but error on old messages after server restart or action expiry -- verify by sending a confirmation prompt, waiting 6 minutes (past the 5-minute expiry), and tapping "Confirm"

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Interface not refactored, Telegram has dead methods | MEDIUM | 1. Freeze Telegram features. 2. Redesign MessagingProvider interface. 3. Rewrite both TwilioProvider and TelegramProvider against new interface. 4. Update all call sites. Essentially starting over on the provider layer. |
| Phone-only user identity, Telegram users in phone column | HIGH | 1. Schema migration to add `telegramUserId` column. 2. Identify and migrate Telegram IDs currently in `phone` column. 3. Fix all queries that assume `phone` is a phone number. 4. Rebuild user resolver for dual identity. Data migration is error-prone if users already have conversations. |
| Duplicate messages from missing deduplication | LOW | 1. Add `update_id` tracking. 2. Clean up duplicate tool execution results (e.g., duplicate media adds) manually. 3. No permanent data corruption if duplicates are caught quickly. |
| Callback query timeout causing user frustration | LOW | 1. Add `answerCallbackQuery` call at the top of callback handler. 2. Immediate fix, no data issues. User frustration is temporary. |
| MarkdownV2 parsing errors silently dropping messages | MEDIUM | 1. Switch to plain text (no `parse_mode`) immediately. 2. Build and test escaping function. 3. Re-enable MarkdownV2 after escaping is verified. 4. Check conversation history for failed messages (users may have missed replies). |
| Unauthorized Telegram users accessing bot | MEDIUM | 1. Implement access control immediately. 2. Review `media_tracking` table for unauthorized additions. 3. Remove unauthorized media if needed. 4. No way to "unsee" search results already shown to unauthorized users. |
| Group chat confirmation race condition | HIGH | 1. Fix `pendingActions` to key by (conversationId, userId) pair. 2. Schema migration. 3. Audit any destructive actions that were incorrectly confirmed in groups. 4. If media was removed by wrong user's confirmation, re-add it. |
| Rate limit (429) causing message loss | LOW | 1. Implement retry queue with `retry_after` backoff. 2. Re-send any messages that were dropped. 3. Check logs for failed sends during the affected period. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SMS-shaped MessagingProvider interface | Phase 1: Provider Interface Refactor | `formatReply()` and `formatEmptyReply()` removed from interface. No Twilio-specific fields in `OutboundMessage`. Both providers implement same interface without dead methods. |
| Phone-number-centric user identity | Phase 1: User Identity Refactor | `telegramUserId` column exists. User resolver handles both phone and Telegram ID resolution. No Telegram IDs in `phone` column. |
| Group chat context collision | Phase 2: Group Chat Support | Two users in a group cannot confirm each other's pending actions. LLM history shows sender names. Rate limiting prevents 429 errors in active groups. |
| Callback query timeout | Phase 2: Interactive Features | Every callback query gets `answerCallbackQuery` within 1 second. No loading spinners remain after button tap. Stale buttons show expiration message. |
| Webhook security model mismatch | Phase 1: Telegram Webhook Setup | Separate routes for Twilio and Telegram. `secret_token` configured and validated with constant-time comparison. `getWebhookInfo` confirms correct setup. |
| Message formatting divergence | Phase 1: Basic text (no parse_mode). Phase 2+: MarkdownV2 with escaping | Phase 1: plain text works on both SMS and Telegram. Phase 2+: Telegram messages use MarkdownV2 with full character escaping. No `400 Bad Request` errors in logs. |
| Webhook retry storm from slow response | Phase 1: Telegram Webhook Handler | Webhook responds with 200 immediately. `update_id` deduplication prevents double processing. Server restart does not cause duplicate tool execution. |
| Hardcoded TWILIO_PHONE_NUMBER | Phase 1: Provider Interface Refactor | Zero occurrences of `config.TWILIO_PHONE_NUMBER` outside of Twilio-specific code. `OutboundMessage` has no `from` field. Provider resolves its own addressing. |
| Unauthorized public bot access | Phase 1: Access Control | Unknown Telegram users get "pending" status. Admin approval required. `/start` triggers onboarding flow. No unapproved users can trigger tool execution. |
| Group privacy mode misconfiguration | Phase 2: Group Chat Support | Bot uses privacy mode (mention-only) in groups. Documentation tells users how to interact. Bot does not process every group message. |

## Sources

- [Telegram Bot API Official Documentation](https://core.telegram.org/bots/api) -- Update structure, sendMessage, callback queries, inline keyboards, webhook setup, secret_token, chat_id types
- [Telegram Bot FAQ](https://core.telegram.org/bots/faq) -- Rate limits (1 msg/sec DM, 20 msg/min group, 30 msg/sec global), file size limits, group privacy mode
- [Telegram Bot Features](https://core.telegram.org/bots/features) -- Privacy mode, group behavior, command handling, @mention requirements
- [Telegram Webhook Guide (Marvin's Marvellous Guide)](https://core.telegram.org/bots/webhooks) -- Webhook setup, SSL requirements, port restrictions (443, 80, 88, 8443), retry behavior
- [Telegram MarkdownV2 Formatting Issues (telegraf#1242)](https://github.com/telegraf/telegraf/issues/1242) -- Complete list of characters requiring escaping, common formatting errors
- [Telegram callback_data 64-byte limit (python-telegram-bot#3528)](https://github.com/python-telegram-bot/python-telegram-bot/issues/3528) -- Maximum callback_data length, encoding workarounds
- [grammY: Long Polling vs Webhooks](https://grammy.dev/guide/deployment-types) -- Webhook sequential delivery per chat, race condition with parallel updates from different chats
- [Telegram duplicate update processing (telegraf#806)](https://github.com/telegraf/telegraf/issues/806) -- update_id deduplication, retry behavior on slow responses
- WadsMedia codebase analysis: `src/messaging/types.ts` (MessagingProvider interface), `src/messaging/twilio-provider.ts` (Twilio implementation), `src/plugins/webhook.ts` (fire-and-forget pattern), `src/conversation/engine.ts` (processConversation with hardcoded TWILIO_PHONE_NUMBER), `src/conversation/confirmation.ts` (pending actions with userId unique constraint), `src/conversation/history.ts` (getHistory keyed by userId), `src/users/user.service.ts` (findUserByPhone), `src/db/schema.ts` (users table with phone-only identity), `src/notifications/notify.ts` (notifyAllActiveUsers with phone-based iteration)

---
*Pitfalls research for: Adding Telegram bot support to WadsMedia -- existing SMS-based conversational media management system*
*Researched: 2026-02-14*

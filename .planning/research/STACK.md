# Stack Research: Telegram Bot Integration

**Domain:** Telegram messaging provider for existing multi-transport media assistant
**Researched:** 2026-02-14
**Confidence:** HIGH

## Existing Stack (DO NOT CHANGE)

Already validated and in production. Listed for context only.

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 22+ | Runtime |
| TypeScript | ^5.9.3 | Language (strict, ESM, `verbatimModuleSyntax`) |
| Fastify | ^5.7.4 | HTTP framework |
| better-sqlite3 | ^12.6.2 | Database driver |
| Drizzle ORM | ^0.45.1 | Query builder / migrations |
| OpenAI SDK | ^6.22.0 | LLM integration (configurable baseURL) |
| Twilio SDK | ^5.12.1 | SMS/RCS messaging |
| Zod | ^4.3.6 | Validation |
| Biome | ^2.3.15 | Linting/formatting |
| Vitest | ^4.0.18 | Testing |

## Recommended Stack Additions

### Core: Telegram Bot API Client

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| grammy | ^1.40.0 | Telegram Bot API typed client | Best TypeScript support among Telegram bot libraries. Types auto-generated from Bot API spec (always current). Provides standalone `Api` class for outbound calls without running a bot loop -- critical for the `MessagingProvider.send()` pattern. MIT license, 3.4k GitHub stars, ~137k weekly npm downloads, actively maintained with Bot API 9.4 support. ESM-native, zero native dependencies, works with Node 22. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none required) | -- | -- | grammy is the only new dependency. The existing stack (Fastify 5, Zod 4, native fetch) provides everything else. grammy handles all Telegram API interaction. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| @BotFather (Telegram) | Bot token provisioning | Interact with this Telegram bot to create your bot, set name/description/about, configure privacy mode. Not an npm package. |
| ngrok or similar tunnel | Local webhook testing | Telegram requires HTTPS public URL for webhooks. Use `ngrok http 3000` during development. Not needed in production (Docker + reverse proxy already provides HTTPS). |

## Installation

```bash
# One new production dependency
npm install grammy
```

No dev dependencies needed. grammy ships with TypeScript declarations built in.

## Why grammy Over Alternatives

### Decision: grammy `Api` class (not grammy `Bot`, not Telegraf, not node-telegram-bot-api, not raw fetch)

**Why grammy at all?**
WadsMedia uses native `fetch()` for all other API clients (Sonarr, Radarr, TMDB, Plex, Tautulli, Brave Search). Consistency argues for raw `fetch()` + type imports. However, Telegram is different from those APIs:
1. Telegram Bot API has 80+ methods. Building a typed wrapper for the 10-15 we need (sendMessage, sendPhoto, setWebhook, deleteWebhook, getWebhookInfo, getMe, answerCallbackQuery, editMessageText, editMessageReplyMarkup, etc.) is 200-300 lines of boilerplate.
2. File uploads require multipart/form-data. sendPhoto supports URL, file_id, or binary upload. grammy handles all three transparently.
3. `reply_markup` JSON serialization has quirks. Telegram expects it as a JSON-stringified object in some contexts. grammy handles this.
4. grammy's `Api` class is functionally equivalent to a typed fetch wrapper -- but pre-built, tested, and kept current with Bot API updates. It adds ~50KB to the bundle, has zero native dependencies, and saves 200+ lines of custom code.

**Why NOT grammy `Bot` class?**
The `Bot` class includes a middleware system (`bot.on()`, `bot.command()`, `bot.callbackQuery()`) that wants to own message routing. WadsMedia already has its own conversation engine (`processConversation`), tool registry, and Fastify-based webhook handling. Using `Bot` would mean either: (a) duplicating routing logic, or (b) abandoning the existing architecture. Neither is acceptable.

**Why NOT Telegraf?**
1. TypeScript quality is worse. Telegraf v4 migrated to TypeScript but types are acknowledged as overly complex. grammy's types are cleaner and auto-generated.
2. Bot API version lag. Telegraf often lags behind Telegram Bot API releases by weeks/months. grammy tracks within days.
3. Framework-heavy. Like grammy's `Bot`, Telegraf's middleware system wants to own routing. But unlike grammy, Telegraf does not expose a standalone API client class -- you must use it through the middleware chain.

**Why NOT node-telegram-bot-api (NTBA)?**
1. Not TypeScript-native. Requires `@types/node-telegram-bot-api`, which lags behind the library.
2. Polling-centric architecture. Built around EventEmitter pattern that doesn't map to webhook-based Fastify routes.
3. Scales poorly. Community consensus (and grammy's own comparison) notes NTBA codebases become "spaghetti-like" past ~50 lines.

**Why NOT raw fetch() + @grammyjs/types?**
Considered seriously for consistency with the codebase's `fetch()` pattern. Rejected because:
1. @grammyjs/types is types-only (zero runtime code). Still need to write all HTTP calls, error handling, file upload logic, and reply_markup serialization.
2. grammy `Api` class IS effectively the typed fetch wrapper already written. Using it saves 200-300 lines with no architectural cost.
3. @grammyjs/types v3.23.0 is a transitive dependency of grammy anyway -- installed automatically.

## What We Use From grammy

| grammy Feature | Use? | Rationale |
|----------------|------|-----------|
| `Api` class | YES | Typed HTTP client for all Telegram Bot API calls. Instantiate with token, call methods directly. |
| `Bot` class | NO | We have our own conversation engine. Do not need grammy's middleware system. |
| `webhookCallback()` | NO | We write our own Fastify route handler. Consistent with Twilio webhook pattern. Keeps secret_token validation explicit. |
| `InlineKeyboard` class | YES | Convenient builder for inline keyboard markup. Avoids manually constructing `InlineKeyboardMarkup` JSON. |
| `Keyboard` class | NO | Reply keyboards (replace system keyboard) not needed. Inline keyboards are better for our action-button UX. |
| `InputFile` class | MAYBE | Only needed for binary file uploads. We send photos by URL, so likely unnecessary. |
| Type exports (`Update`, `Message`, `CallbackQuery`, `InlineKeyboardMarkup`) | YES | Type webhook payloads and TelegramMessagingProvider interface. |

## Integration Architecture

### How grammy Fits With Existing MessagingProvider

The key insight: grammy's `Api` class is used ONLY for outbound calls. Inbound webhook processing is handled by our own Fastify route, just like Twilio.

```
INBOUND (webhook):
  Telegram servers
    -> POST /webhook/telegram (Fastify route)
    -> preHandler: validate X-Telegram-Bot-Api-Secret-Token header
    -> parseInbound(request.body as Update)
    -> resolveUser (by Telegram user ID, not phone)
    -> processConversation() [existing engine, unchanged]

OUTBOUND (send):
  processConversation()
    -> messaging.send(message)
    -> TelegramMessagingProvider.send()
    -> grammy Api.sendMessage() / Api.sendPhoto()
    -> Telegram servers

CALLBACK QUERIES (inline keyboard button presses):
  Telegram servers
    -> POST /webhook/telegram (same route)
    -> detect update.callback_query (not update.message)
    -> answerCallbackQuery() (dismiss loading indicator)
    -> extract callback_data, map to action
    -> processConversation() with synthetic message
```

### Interface Adaptations Required

The existing `MessagingProvider` interface and types need evolution to support Telegram:

**`InboundMessage`** -- Current shape assumes Twilio fields (messageSid, buttonPayload). Telegram provides different fields (update_id, chat.id, from.id, callback_query). Need to either:
- Generalize InboundMessage to be provider-agnostic (recommended), or
- Create a union type with provider-specific variants

**`OutboundMessage`** -- Current shape has `to: string` (phone number), `from: string` (Twilio phone). Telegram uses `chat_id: number`. Need to either:
- Make `to` accept `string | number`, or
- Use string representation of chat_id

**`SendResult`** -- Current shape has `sid: string` (Twilio message SID). Telegram returns `message_id: number`. Map to string for interface consistency.

**`formatReply()` / `formatEmptyReply()`** -- These generate TwiML XML. Telegram webhooks don't use synchronous reply format. Return empty JSON `{}` or use the webhook reply envelope (optional optimization where the response body IS the API call).

**`validateWebhook()`** -- Twilio uses HMAC signature. Telegram uses static secret_token header comparison. Same interface, different implementation.

## Telegram Bot API Key Facts

These directly affect implementation decisions:

| Fact | Impact on WadsMedia |
|------|---------------------|
| Webhooks require HTTPS on ports 443, 80, 88, or 8443 | Existing Docker + reverse proxy (nginx/Caddy) already provides this. No change needed. |
| `secret_token` in setWebhook -> `X-Telegram-Bot-Api-Secret-Token` header | Simpler than Twilio HMAC. Just constant-time string comparison in preHandler. |
| Telegram sends JSON POST (not form-encoded like Twilio) | Fastify parses JSON by default. No `@fastify/formbody` needed for Telegram route. |
| `callback_data` limited to 64 bytes | Inline keyboard button payloads must be compact. Use short codes: `add:m:12345` (add movie TMDB ID 12345), not JSON objects. |
| Bot privacy mode ON by default in groups | Bot only sees /commands, @mentions, and replies to bot messages. For TELE-02/TELE-03 (group chat), must disable privacy via BotFather OR design around mentions. Recommend disabling privacy mode. |
| Photos sent by URL (no upload needed) | sendPhoto accepts URL string for `photo` param. TMDB poster URLs work directly. No file upload handling needed. |
| `answerCallbackQuery` must be called within 30 seconds | After user taps inline keyboard button, must call answerCallbackQuery or client shows loading spinner indefinitely. Fire immediately, before processing the action. |
| Chat ID: positive for private chats, negative for groups | Different from Twilio phone numbers. User identity resolution needs Telegram-specific path (Telegram user ID -> WadsMedia user record). |
| Webhook timeout: Telegram retries after ~60 seconds | Must respond to webhook request quickly. Existing pattern (respond immediately, process async) works perfectly. |
| Updates available for 24 hours before automatic deletion | If webhook is down for <24h, messages queue. Longer outages lose messages (acceptable for this use case). |
| Maximum 100 concurrent webhook connections per bot | More than sufficient for a personal/small-group media assistant. |

## Webhook vs Long Polling Decision

**Use webhooks.** Rationale:

| Criterion | Webhook | Long Polling |
|-----------|---------|--------------|
| Existing architecture | Fastify already handles webhooks (Twilio, Sonarr, Radarr notifications) | Would need a separate polling loop alongside Fastify |
| Latency | Real-time push from Telegram | Slight delay depending on poll interval |
| Resource efficiency | No open connections when idle | Constant connection to Telegram servers |
| Docker deployment | Works with existing reverse proxy | Works but unnecessary complexity |
| Development | Requires HTTPS tunnel (ngrok) for local dev | Simpler local development |
| Production readiness | Standard for production bots | Typically dev/prototype only |

The development inconvenience of needing ngrok is minor and identical to the existing Twilio development workflow. WadsMedia is already deployed behind a reverse proxy with HTTPS.

## Environment Variables (New for Telegram)

```bash
# Telegram (required for Telegram integration)
TELEGRAM_BOT_TOKEN=        # Token from @BotFather (format: 123456:ABC-DEF...)
TELEGRAM_WEBHOOK_SECRET=   # Random string for X-Telegram-Bot-Api-Secret-Token (1-256 chars, [A-Za-z0-9_-])
```

These extend the existing `config.ts` Zod schema as optional fields, following the same pattern as `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.

## User Identity Resolution for Telegram

Critical architectural consideration. Telegram users are identified by numeric user ID (e.g., `12345678`), not phone number. The current system resolves users by phone (`body.From` in Twilio webhooks).

**Recommended approach:**
1. Add `telegramUserId` column to `users` table (nullable integer, unique).
2. Telegram webhook resolves users by `update.message.from.id` -> look up `users.telegramUserId`.
3. Admin links Telegram users to existing WadsMedia accounts via the admin dashboard (similar to existing Plex user linking).
4. Alternatively, auto-create users on first Telegram message if `TELEGRAM_AUTO_REGISTER` is enabled.
5. The `userPhone` field in ProcessConversationParams becomes `userIdentifier` (string that could be phone or Telegram user ID string).

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| grammy `Api` class | Raw `fetch()` + `@grammyjs/types` | Only if you want absolute zero runtime dependencies and are willing to maintain 200-300 lines of Telegram API wrapper code. Reasonable for a bot that only calls sendMessage. Not worth it for our feature set (inline keyboards, callback queries, photo sending, webhook management). |
| grammy `Api` class | Telegraf | Only if you have an existing Telegraf codebase or want Telegraf's middleware to own your bot logic. Not our case -- WadsMedia has its own conversation engine. |
| grammy `Api` class | `@eomm/fastify-telegram` | If you want Telegram as a Fastify plugin decorator. Poorly maintained, low npm downloads. WadsMedia wants provider-agnostic architecture, not another Fastify decoration. |
| grammy `Api` class | GramIO | If you want the newest framework with auto-generated types. Smaller community, less battle-tested. grammy provides everything we need. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| grammy `Bot` class + `bot.start()` | Takes over routing with its own middleware system. Conflicts with WadsMedia's Fastify webhook handling and conversation engine. Creates parallel routing that duplicates existing architecture. | grammy `Api` class for typed API calls + manual Fastify route for webhook |
| `webhookCallback(bot, "fastify")` | Couples grammy's request lifecycle to your route. Hides secret_token validation. Inconsistent with Twilio webhook pattern. Makes the Telegram route work differently from every other webhook in the app. | Manual Fastify route: read `request.body` as `Update`, validate secret header, call TelegramMessagingProvider methods |
| node-telegram-bot-api | Poor TypeScript, polling-centric, scales poorly | grammy |
| Telegraf `bot.launch()` / `bot.handleUpdate()` | Forces updates through Telegraf's middleware chain. Cannot extract standalone API client. | grammy `Api` (usable standalone) |
| Multiple Telegram libraries | Dependency bloat, conflicting types, confusion about which API to call | Pick one: grammy |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| grammy@^1.40.0 | Node.js >= 18 | Uses native fetch internally. WadsMedia uses Node 22 -- fully compatible. |
| grammy@^1.40.0 | TypeScript >= 5.0 | WadsMedia uses TS 5.9.3 -- fully compatible. |
| grammy@^1.40.0 | ESM | grammy supports ESM imports natively. WadsMedia uses `"type": "module"` -- fully compatible. |
| grammy@^1.40.0 | Telegram Bot API 9.4 | Latest Bot API version as of February 2026. |
| grammy@^1.40.0 | Fastify 5 | No direct dependency. grammy Api class is framework-agnostic. Works alongside Fastify without conflict. |

## Sources

- [grammy.dev/resources/comparison](https://grammy.dev/resources/comparison) -- Framework comparison: grammy vs Telegraf vs NTBA. TypeScript quality, Bot API coverage, maintenance cadence. HIGH confidence.
- [grammy.dev/guide/deployment-types](https://grammy.dev/guide/deployment-types) -- Webhook vs long polling guide. webhookCallback adapter list (includes "fastify"). Timeout handling. HIGH confidence.
- [grammy.dev/guide/api](https://grammy.dev/guide/api) -- Standalone Api class usage without Bot middleware. sendMessage/sendPhoto examples. Confirms Api can be used independently. HIGH confidence.
- [grammy.dev/plugins/keyboard](https://grammy.dev/plugins/keyboard) -- InlineKeyboard builder class API. Callback data handling. HIGH confidence.
- [grammy.dev/ref/core/webhookcallback](https://grammy.dev/ref/core/webhookcallback) -- webhookCallback API reference. Framework adapter parameter. HIGH confidence.
- [github.com/grammyjs/grammY](https://github.com/grammyjs/grammY) -- Source code. Fastify adapter in frameworks.ts. 3.4k stars, MIT, Bot API 9.4. HIGH confidence.
- [github.com/grammyjs/types](https://github.com/grammyjs/types) -- Types-only package. v3.23.0. Zero runtime code. Covers all Bot API objects/methods. HIGH confidence.
- [core.telegram.org/bots/api](https://core.telegram.org/bots/api) -- Official Telegram Bot API reference. setWebhook, secret_token, sendMessage, sendPhoto, InlineKeyboardMarkup, Update object, callback_query. HIGH confidence.
- [core.telegram.org/bots/features](https://core.telegram.org/bots/features) -- Bot privacy mode, group chat behavior, command scopes. HIGH confidence.
- [npmtrends.com/grammy-vs-node-telegram-bot-api-vs-telegraf](https://npmtrends.com/grammy-vs-node-telegram-bot-api-vs-telegraf-vs-telegram-bot-api) -- Download comparison. grammy ~137k/week, telegraf ~138k/week, NTBA ~157k/week. MEDIUM confidence (snapshot).
- [npmjs.com/package/grammy](https://www.npmjs.com/package/grammy) -- v1.40.0, published February 2026. HIGH confidence.
- [npmjs.com/package/@grammyjs/types](https://www.npmjs.com/package/@grammyjs/types) -- v3.23.0, types-only. HIGH confidence.

---
*Stack research for: WadsMedia v2.1 Telegram Bot Integration*
*Researched: 2026-02-14*

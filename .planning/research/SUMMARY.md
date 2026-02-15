# Project Research Summary

**Project:** WadsMedia v2.1 Telegram & Polish
**Domain:** Adding Telegram bot as a second messaging provider to an existing SMS-based conversational media assistant
**Researched:** 2026-02-14
**Overall confidence:** HIGH

## Executive Summary

WadsMedia v2.1 adds Telegram as a second messaging transport alongside the existing SMS/Twilio integration. The core challenge is not the Telegram Bot API itself (which is well-documented and straightforward), but the fact that the existing MessagingProvider interface, user identity model, and conversation engine all encode SMS/Twilio assumptions that run deeper than the interface name suggests. The `MessagingProvider` interface has TwiML-specific methods (`formatReply`, `formatEmptyReply`), the `OutboundMessage` type carries Twilio-specific fields (`contentSid`, `messagingServiceSid`, `from`), the user model keys on `phone` as a NOT NULL UNIQUE column, and the conversation engine hardcodes `from: config.TWILIO_PHONE_NUMBER` in at least 8 locations.

The recommended stack adds exactly **one new npm dependency: grammy** (^1.40.0). This is the Telegram Bot Framework, but we use it exclusively as a typed API client (the `Api` class), NOT as a bot framework. grammy's `Api` class provides typed access to all Telegram Bot API methods (sendMessage, sendPhoto, answerCallbackQuery, setWebhook, etc.) without bringing in any routing, middleware, or request handling -- those remain in Fastify, consistent with the existing architecture.

The integration follows three architectural principles: (1) generalize user identity from phone-only to multi-provider addressing, (2) implement TelegramMessagingProvider as a second provider sharing the same interface, and (3) add a separate webhook route with its own validation. The conversation engine (`processConversation`) remains transport-agnostic -- it does not need to know whether it is replying via SMS or Telegram. Provider-specific differences (sender identity, message formatting, rich content) are encapsulated in the provider implementation.

The most complex feature is Telegram group chat support (TELE-02/TELE-03), which introduces multi-user conversation context, per-message user resolution, and @mention-based activation. This should be built after DM support is solid. The highest-impact quick wins are inline keyboard buttons and poster image sending, which are dramatically simpler on Telegram than the equivalent RCS/Content Template approach on Twilio.

## Key Findings

**Stack:** One new dependency -- grammy ^1.40.0 (Telegram Bot API typed client). Use `Api` class only, not `Bot` class. No other new packages.

**Architecture:** Generalize MessagingProvider interface, add `telegramUserId` column to users table, create TelegramMessagingProvider + webhook route as new Fastify plugins. Conversation engine stays transport-agnostic.

**Critical pitfall:** The MessagingProvider interface is SMS-shaped, not provider-agnostic. Refactoring it must be the first step before any Telegram implementation, or every Telegram feature will be built around an interface that does not fit.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Provider Interface Generalization + SMS Polish** - Refactor first, build second
   - Addresses: TELE-06 (user identity), SMS-01 (configurable MMS URL), SMS-02 (dead code removal)
   - Avoids: SMS-shaped interface pitfall, hardcoded TWILIO_PHONE_NUMBER pitfall
   - Rationale: Every subsequent phase depends on a generalized interface. Do this refactoring while the only provider is Twilio (easier to verify nothing breaks). Combine with SMS polish items since they touch the same files.

2. **Telegram DM Integration** - Core Telegram provider + webhook + user resolution
   - Addresses: TELE-01 (full DM capabilities), TELE-04 (poster images), TELE-05 (inline keyboards), TELE-06 (user identity)
   - Avoids: Webhook security mismatch, callback query timeout, fire-and-forget retry storm pitfalls
   - Rationale: DM is the complete 1:1 Telegram experience. All existing capabilities (search, add, remove, status, discover, Plex check, watch history) work through the same conversation engine. Inline keyboards and poster images are Telegram's primary UX differentiators over SMS and should be included from day one.

3. **Telegram Group Chat** - Shared context, @mention activation, multi-user resolution
   - Addresses: TELE-02 (group chat), TELE-03 (@mention responses)
   - Avoids: Group chat context collision, confirmation race condition pitfalls
   - Rationale: Most complex feature. Requires group-scoped conversation history, per-message user resolution, privacy mode configuration, and rate limiting. Build only after DM is solid.

4. **Admin Dashboard UX Polish** - Navigation and Plex linking improvements
   - Addresses: ADMN-07 (navigation), ADMN-08 (Plex linking UX)
   - Rationale: Independent of Telegram work. Small scope, can be done in parallel or after Telegram phases.

**Phase ordering rationale:**
- Interface generalization MUST come first because every subsequent change depends on provider-agnostic types. Doing Telegram implementation against the current interface creates technical debt that compounds with every feature.
- DM before group chat because DM is the complete core experience (all 14 tools work) while group chat adds complexity (shared context, multi-user, rate limiting). Get DM right, then layer group support.
- SMS polish is bundled with interface generalization because the changes touch the same files (engine.ts, types.ts, notify.ts).
- Dashboard UX is independent and can be parallelized.

**Research flags for phases:**
- Phase 1 (Interface Refactor): Standard refactoring. No research needed during planning. Every file that needs changes is already identified (see ARCHITECTURE.md "Modified Files" section).
- Phase 2 (Telegram DM): Mostly standard patterns. The grammy `Api` class usage, webhook route, and user resolution follow established patterns from the Twilio integration. Minor research may be needed for inline keyboard callback data design (64-byte limit).
- Phase 3 (Group Chat): Likely needs deeper research. Group-scoped conversation history is a new concept. Interaction with the existing `pendingActions` unique constraint on userId needs careful design. Privacy mode behavior and @mention parsing need verification.
- Phase 4 (Dashboard UX): No research needed. Simple UI changes.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | grammy verified via official docs, npm, and GitHub. v1.40.0 current. Api class usage pattern confirmed via grammy guide. ESM, Node 22, TypeScript 5.9 compatibility confirmed. |
| Features | HIGH | Telegram Bot API features (sendMessage, sendPhoto, InlineKeyboardMarkup, callback_query, setWebhook) verified via official documentation. Competitor bots (Searcharr, Addarr, Botdarr) analyzed for feature landscape. Anti-features (MarkdownV2, inline mode, reply keyboards) researched and rejected with specific rationale. |
| Architecture | HIGH | Every modified file identified via direct codebase analysis. MessagingProvider interface limitations documented with specific line references. Data flow for both webhook types (Twilio form-encoded vs Telegram JSON) fully specified. Provider registry pattern and notification dispatch designed. |
| Pitfalls | HIGH | 8 critical pitfalls identified, each with specific prevention strategy and phase assignment. Callback query timeout, webhook retry behavior, MarkdownV2 escaping, and group chat context collision verified against official Telegram docs and community issue threads. "Looks Done But Isn't" checklist provides concrete verification steps. |

## Gaps to Address

- **grammy Api class standalone usage verification:** Research confirms the `Api` class can be used without `Bot` middleware, but specific import paths and initialization patterns should be verified during Phase 2 implementation. LOW risk -- the pattern is documented and the API is simple.

- **Group chat conversation history schema design:** The current `messages` table keys on `userId`. Group chats need a `conversationId` concept (keyed by chatId for groups, userId for DMs). The exact schema design (new column vs new table) needs resolution during Phase 3 planning.

- **Telegram rate limiting implementation:** The 30 msg/sec global and 20 msg/min per group limits are documented, but the retry strategy (queue + backoff vs immediate retry with `retry_after`) needs design during Phase 2/3 implementation.

- **Account linking (SMS + Telegram same user):** Research identifies the need but defers the mechanism. A user who contacts via both SMS and Telegram should ideally share one conversation history. The linking mechanism (admin dashboard, /link command, automatic phone match) needs design if cross-provider continuity is desired.

- **System prompt adaptation for Telegram:** The current system prompt says "you are sending SMS text messages." Telegram users should get different formatting guidance (HTML parse_mode, longer messages allowed, no MMS workarounds). Whether to use a single prompt with provider-aware sections or two separate prompts needs resolution during Phase 2.

## Sources

### Primary (HIGH confidence)
- [Telegram Bot API Documentation](https://core.telegram.org/bots/api) -- Update object, sendMessage, sendPhoto, InlineKeyboardMarkup, callback_query, setWebhook, secret_token
- [Telegram Bot Features](https://core.telegram.org/bots/features) -- Privacy mode, group chat behavior, command scopes, menu button
- [grammy Official Documentation](https://grammy.dev/) -- Api class, InlineKeyboard builder, webhook deployment, framework comparison
- [grammy GitHub Repository](https://github.com/grammyjs/grammY) -- Source code analysis, Fastify adapter implementation, version history
- [npmjs.com/package/grammy](https://www.npmjs.com/package/grammy) -- v1.40.0 current, weekly downloads, dependencies
- [@grammyjs/types GitHub](https://github.com/grammyjs/types) -- v3.23.0, types-only package, Bot API coverage
- Existing WadsMedia codebase -- Direct analysis of all 80 source files, MessagingProvider interface, conversation engine, webhook patterns

### Secondary (MEDIUM confidence)
- [grammy vs Telegraf vs NTBA comparison](https://grammy.dev/resources/comparison) -- Framework selection rationale (note: hosted on grammy's site, inherent bias acknowledged)
- [npm trends comparison](https://npmtrends.com/grammy-vs-node-telegram-bot-api-vs-telegraf) -- Download statistics snapshot
- [Telegram MarkdownV2 issues](https://github.com/telegraf/telegraf/issues/1242) -- Character escaping requirements
- [Searcharr](https://github.com/toddrob99/searcharr), [Addarr](https://github.com/Waterboy1602/Addarr), [Botdarr](https://github.com/shayaantx/botdarr) -- Competitor bot feature analysis

---
*Research completed: 2026-02-14*
*Ready for roadmap: yes*

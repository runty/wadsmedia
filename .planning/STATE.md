# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** Users can manage their media libraries through natural conversation -- text a message, get things done, no UI to learn.
**Current focus:** v2.1 Telegram & Polish -- Phase 17 complete, milestone DONE

## Current Position

Phase: 17 of 17 (Admin Dashboard UX Polish) -- COMPLETE
Plan: 1 of 1 (17-01 complete)
Status: Milestone Complete
Last activity: 2026-02-15 -- 17-01 complete (Admin dashboard UX polish)

Progress: [████████████████████████████████] 5/5 phases (v2.1 milestone complete)

## Performance Metrics

**v1.0 Velocity (Phases 1-8):**
- Plans: 19 | Execution time: ~45min

**v2.0 Velocity (Phases 9-13):**
- Plans: 11 | Commits: 53 | Execution time: ~38min

**v2.1 Velocity (Phase 14):**
- Plans: 3 | Execution time: ~3min (14-01), ~2min (14-02), ~3min (14-03)

**v2.1 Velocity (Phase 15):**
- Plans: 3/3 | Execution time: ~2min (15-01), ~2min (15-02), ~3min (15-03)

**v2.1 Velocity (Phase 16):**
- Plans: 2/2 | Execution time: ~3min (16-01), ~2min (16-02)

**v2.1 Velocity (Phase 17):**
- Plans: 1/1 | Execution time: ~2min (17-01)

**Combined:**
- Total plans completed: 38 (across 17 phases)
- Total execution time: ~1.5 hours

## Accumulated Context

### Decisions

Decisions archived in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- v2.1 Roadmap: Refactor MessagingProvider interface before building Telegram (avoids SMS-shaped interface pitfall)
- v2.1 Roadmap: Use grammy Api class only (not Bot framework) -- typed Telegram API client, Fastify handles routing
- v2.1 Roadmap: TELE-06 (user identity) assigned to Phase 15 -- schema prep in Phase 14, full resolution in Phase 15
- 14-01: Provider encapsulates sender identity (fromNumber in constructor, callers never pass from)
- 14-01: TwilioOutboundMessage extends OutboundMessage for Twilio-specific rich card fields
- 14-01: formatWebhookResponse returns string|null (Twilio: TwiML string, Telegram: null)
- 14-01: MMS pixel URL moved to configurable MMS_PIXEL_URL env var
- 14-03: Used type assertions for phone in SMS-only paths rather than refactoring all callers
- 14-03: Kept phone-based update functions for backward compat; added ID-based alternatives for Telegram
- 14-02: replyAddress replaces userPhone everywhere (provider-agnostic destination identifier)
- 14-02: Notification plugin guards removed; messaging dependency declaration handles availability
- 15-01: Used grammy Api class directly (not Bot framework) for typed Telegram HTTP client
- 15-01: Extended OutboundMessage with optional Telegram fields (inlineKeyboard, photoUrl, parseMode) rather than subtype
- 15-01: Plugin gracefully skips when TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET not set
- 15-02: Telegram users created with displayName from first_name, skip onboarding name-asking steps
- 15-02: Admin notification for Telegram users sent from webhook plugin (not onboarding.ts)
- 15-02: Telegram webhook plugin gracefully skips when telegramMessaging not available
- 15-03: System prompt addendum pattern for provider-specific formatting (append, don't branch)
- 15-03: providerName derived from messaging.providerName with explicit param fallback
- 15-03: Admin notifications prefer ADMIN_TELEGRAM_CHAT_ID via Telegram, fall back to ADMIN_PHONE via SMS
- 15-03: telegramMessaging wired through both Twilio and Telegram webhook routes for cross-provider access
- 16-01: User messages prefixed with [SenderName] for group attribution rather than separate metadata field
- 16-01: getHistory filtered to groupChatId IS NULL to prevent group messages leaking into DM history
- 16-01: buildSystemPrompt extended with opts parameter (isGroup, senderName) rather than separate function
- 16-01: replyToMessageId passed through OutboundMessage to TelegramMessagingProvider reply_parameters
- 16-02: Activation detection uses three triggers (mention, reply, keyword) combined into single shouldActivateInGroup gate
- 16-02: Sender identity extracted from raw update from.id (not parseInbound chat.id) for group user resolution
- 16-02: In-memory rate limiting with Map<groupChatId, timestamps[]> -- 15/60s cap below Telegram 20/min limit
- 16-02: TELEGRAM_BOT_USERNAME static env var rather than dynamic getMe() call at startup
- 17-01: tautulliStatus uses string union type instead of boolean/null for explicit three-state branching
- 17-01: Error state uses red styling matching flash-error; not-configured uses amber for visual distinction

### Pending Todos

- Start RCS brand onboarding with Twilio (blocks rich card delivery)

### Blockers/Concerns

- RCS brand approval for homelab projects is uncertain; SMS/MMS fallback is functional alternative
- Telegram Bot API rate limits (30 messages/second to different chats, 20 messages/minute in same group)
- Group chat conversation history schema design resolved in 16-01 (groupChatId column approach)

## Session Continuity

Last session: 2026-02-15
Stopped at: Completed 17-01-PLAN.md (Admin dashboard UX polish) -- Phase 17 complete, v2.1 milestone complete
Resume file: None

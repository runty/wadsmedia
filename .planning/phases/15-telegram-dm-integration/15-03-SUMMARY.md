---
phase: 15-telegram-dm-integration
plan: 03
subsystem: messaging
tags: [telegram, html-formatting, system-prompt, notifications, multi-provider]

# Dependency graph
requires:
  - phase: 15-telegram-dm-integration
    plan: 01
    provides: TelegramMessagingProvider with send, parseMode HTML support, inline keyboards
  - phase: 15-telegram-dm-integration
    plan: 02
    provides: POST /webhook/telegram route with user resolution and conversation routing
  - phase: 14-messaging-refactor
    provides: MessagingProvider interface, provider-agnostic processConversation
provides:
  - Provider-aware system prompt with Telegram HTML formatting guidance
  - Engine with Telegram reply handling (parseMode HTML, no MMS pixel)
  - Multi-provider notification dispatch to both SMS and Telegram users
  - Admin notifications via preferred channel (Telegram if ADMIN_TELEGRAM_CHAT_ID set)
  - telegramMessaging in ToolContext for cross-provider tool notifications
affects: [16-telegram-group-chat]

# Tech tracking
tech-stack:
  added: []
  patterns: [provider-aware system prompt addendum, multi-provider notification dispatch, preferred-channel admin notification]

key-files:
  created: []
  modified:
    - src/conversation/system-prompt.ts
    - src/conversation/engine.ts
    - src/conversation/types.ts
    - src/notifications/notify.ts
    - src/plugins/notifications.ts
    - src/conversation/tools/add-movie.ts
    - src/conversation/tools/add-series.ts
    - src/plugins/webhook.ts
    - src/plugins/telegram-webhook.ts

key-decisions:
  - "Provider-aware system prompt via addendum pattern (append TELEGRAM_ADDENDUM rather than branching the whole prompt)"
  - "providerName derived from messaging.providerName with explicit param as fallback"
  - "Telegram notifications preferred over SMS for admin when ADMIN_TELEGRAM_CHAT_ID is set"
  - "telegramMessaging wired through both Twilio and Telegram webhook routes for cross-provider admin notifications"

patterns-established:
  - "System prompt addendum pattern: base prompt + provider-specific addendum for format overrides"
  - "Provider-aware reply: check providerName to determine send options (parseMode, MMS pixel, etc.)"
  - "Preferred channel notification: check Telegram config first, fall back to SMS"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 15 Plan 03: Provider-Aware Formatting and Multi-Provider Notifications Summary

**Provider-aware system prompt with HTML formatting for Telegram, multi-provider notification dispatch to SMS and Telegram users, and preferred-channel admin notifications**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T17:40:30Z
- **Completed:** 2026-02-15T17:43:23Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- System prompt appends Telegram HTML formatting guidance when provider is "telegram", leaving SMS prompt unchanged
- Engine sends Telegram replies with parseMode: "HTML" and skips MMS pixel; SMS path unchanged
- notifyAllActiveUsers dispatches to both SMS users (via Twilio) and Telegram users (via Telegram provider)
- Admin notifications in add-movie/add-series prefer ADMIN_TELEGRAM_CHAT_ID via Telegram provider, fall back to ADMIN_PHONE via SMS
- telegramMessaging wired through both Twilio and Telegram webhook routes so tools can reach Telegram-based admins from either provider

## Task Commits

Each task was committed atomically:

1. **Task 1: Make system prompt and engine provider-aware for Telegram formatting** - `e17c60d` (feat)
2. **Task 2: Multi-provider notification dispatch and admin notification via preferred channel** - `670131a` (feat)
3. **Task 3: Wire telegramMessaging through Twilio webhook route for cross-provider access** - `1d1c7f7` (feat)

## Files Created/Modified
- `src/conversation/system-prompt.ts` - TELEGRAM_ADDENDUM constant; buildSystemPrompt accepts optional provider param
- `src/conversation/engine.ts` - providerName detection, parseMode: "HTML" for Telegram, telegramMessaging in ProcessConversationParams and tool context
- `src/conversation/types.ts` - Added optional telegramMessaging field to ToolContext
- `src/notifications/notify.ts` - Multi-provider dispatch: Telegram users via telegramProvider, SMS users via messaging
- `src/plugins/notifications.ts` - Pass fastify.telegramMessaging to Sonarr/Radarr notification handlers
- `src/conversation/tools/add-movie.ts` - Admin notification prefers ADMIN_TELEGRAM_CHAT_ID via telegramMessaging
- `src/conversation/tools/add-series.ts` - Admin notification prefers ADMIN_TELEGRAM_CHAT_ID via telegramMessaging
- `src/plugins/webhook.ts` - Twilio webhook passes telegramMessaging to processConversation
- `src/plugins/telegram-webhook.ts` - Telegram webhook passes telegramMessaging to processConversation

## Decisions Made
- Provider-aware system prompt uses addendum pattern (append TELEGRAM_ADDENDUM) rather than creating separate prompts -- keeps a single source of truth for the base personality/instructions
- providerName derived from messaging.providerName with explicit param as fallback -- the messaging object already carries providerName, explicit param is belt-and-suspenders
- Telegram notifications preferred over SMS for admin when ADMIN_TELEGRAM_CHAT_ID is set -- admin should receive notifications on their preferred channel
- telegramMessaging wired through both webhook routes -- enables tools on either provider to send admin notifications via Telegram

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added telegramMessaging to ToolContext during Task 1**
- **Found during:** Task 1 (system prompt and engine changes)
- **Issue:** Engine passes telegramMessaging to tool context, but ToolContext type in types.ts didn't have the field yet (Task 3's job). TypeScript compilation failed.
- **Fix:** Added `telegramMessaging?: MessagingProvider` to ToolContext in Task 1 instead of Task 3
- **Files modified:** src/conversation/types.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** e17c60d (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Moved ToolContext update from Task 3 to Task 1 for type safety. No scope creep. Task 3 still wired the webhook routes as planned.

## Issues Encountered
None

## User Setup Required
None - all configuration variables (ADMIN_TELEGRAM_CHAT_ID, TELEGRAM_BOT_TOKEN) were already defined in Phases 14/15-01.

## Next Phase Readiness
- Phase 15 Telegram DM integration is complete: provider, webhook route, and formatting/notifications all wired
- Telegram users receive HTML-formatted responses with provider-specific guidance
- Both SMS and Telegram users receive Sonarr/Radarr event notifications
- Admin notifications route to preferred channel
- Ready for Phase 16 (Telegram group chat) which will extend the private chat foundation

## Self-Check: PASSED

All 9 files verified present. All 3 commit hashes verified in git log.

---
*Phase: 15-telegram-dm-integration*
*Completed: 2026-02-15*

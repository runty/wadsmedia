---
phase: 14-provider-generalization-sms-polish
plan: 02
subsystem: messaging
tags: [twilio, messaging-provider, replyAddress, sms-polish, dead-code-removal]

# Dependency graph
requires:
  - phase: 14-01
    provides: "Provider-agnostic MessagingProvider interface with encapsulated sender identity"
provides:
  - "All consumer code uses replyAddress instead of userPhone (provider-agnostic address)"
  - "Dead splitForSms() function removed from engine.ts (SMS-02)"
  - "TWILIO_PHONE_NUMBER guards removed from notify.ts and notifications.ts"
  - "Unused formatAsRichCard import removed from engine.ts"
affects: [15-telegram-provider, 16-telegram-conversations]

# Tech tracking
tech-stack:
  added: []
  patterns: [replyAddress-abstraction, provider-agnostic-notification-guards]

key-files:
  created: []
  modified:
    - src/conversation/engine.ts
    - src/conversation/types.ts
    - src/plugins/webhook.ts
    - src/users/onboarding.ts
    - src/notifications/notify.ts
    - src/plugins/notifications.ts

key-decisions:
  - "replyAddress replaces userPhone everywhere: same value for SMS (phone number), will be chat ID for Telegram"
  - "Notification plugin guard removed: messaging dependency declaration handles availability check"
  - "notify.ts config parameter kept in signature (prefixed _config) to avoid breaking callers"

patterns-established:
  - "replyAddress: provider-agnostic destination identifier (phone for SMS, chat ID for Telegram)"
  - "Provider availability via dependency declaration, not env var guards"

# Metrics
duration: 2min
completed: 2026-02-15
---

# Phase 14 Plan 02: Consumer Updates + SMS Polish Summary

**Renamed userPhone to replyAddress across all consumers, removed dead splitForSms code (SMS-02), and eliminated Twilio-specific guards from notification pipeline**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-15T14:31:04Z
- **Completed:** 2026-02-15T14:33:41Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Renamed userPhone to replyAddress in ProcessConversationParams, ToolContext, and all consumer code (engine.ts, webhook.ts, onboarding.ts)
- Deleted dead splitForSms() function from engine.ts (SMS-02 complete)
- Removed TWILIO_PHONE_NUMBER guards from notify.ts and notifications.ts -- provider availability is now handled by dependency declarations
- Removed unused formatAsRichCard import from engine.ts
- Full project compiles and Biome lints cleanly on all modified files

## Task Commits

Each task was committed atomically:

1. **Task 1: Refactor conversation engine and types** - `fe984a8` (refactor)
2. **Task 2: Update webhook handler and all remaining callers** - `4ab7e61` (refactor)

## Files Created/Modified
- `src/conversation/types.ts` - ToolContext uses replyAddress instead of userPhone
- `src/conversation/engine.ts` - ProcessConversationParams uses replyAddress, splitForSms deleted, formatAsRichCard import removed
- `src/plugins/webhook.ts` - Local variable renamed to replyAddress, processConversation call updated
- `src/users/onboarding.ts` - Local variable renamed to replyAddress for consistency
- `src/notifications/notify.ts` - TWILIO_PHONE_NUMBER guard removed, config parameter prefixed with underscore
- `src/plugins/notifications.ts` - TWILIO_PHONE_NUMBER guard removed (messaging dependency handles availability)

## Decisions Made
- **replyAddress naming**: Semantic rename from userPhone to replyAddress. For SMS, the value is still a phone number; for Telegram (Phase 15), it will be a chat ID. The name reflects what it is: the address to reply to, regardless of provider.
- **Notification guard removal**: The TWILIO_PHONE_NUMBER guard in notifications.ts was redundant because the plugin declares `messaging` as a dependency. If messaging fails to register (no Twilio credentials), the notifications plugin also won't register. The guard in notify.ts was similarly redundant since the messaging provider is always passed as a parameter.
- **Config parameter retention**: Kept the `config` parameter in notifyAllActiveUsers (as `_config`) to avoid changing the function signature and all callers. It may be needed later for provider-specific notification routing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Renamed userPhone in onboarding.ts local variable**
- **Found during:** Task 2
- **Issue:** Plan's must_haves state "No file in src/ references userPhone". The onboarding.ts file had a local variable named userPhone that wasn't from the interface but still matched the grep pattern.
- **Fix:** Renamed local variable from userPhone to replyAddress for consistency
- **Files modified:** src/users/onboarding.ts
- **Verification:** `grep -rn "userPhone" src/` returns zero matches
- **Committed in:** 4ab7e61 (Task 2 commit)

**2. [Rule 1 - Bug] Prefixed unused config parameter in notify.ts**
- **Found during:** Task 2
- **Issue:** After removing the TWILIO_PHONE_NUMBER guard, the config parameter became unused, causing a Biome lint error
- **Fix:** Prefixed with underscore: `_config: AppConfig`
- **Files modified:** src/notifications/notify.ts
- **Verification:** `npx biome check src/notifications/notify.ts` passes
- **Committed in:** 4ab7e61 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug)
**Impact on plan:** Both fixes necessary for passing must_have verification and linting. No scope creep.

## Issues Encountered
- Pre-existing Biome formatting issues exist in 5 other files (content-templates.ts, twilio-provider.ts, messaging.ts, message-formatter.ts, routing.test.ts). These are unrelated to this plan's changes and were not touched.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All consumer code is fully provider-agnostic: no Twilio-specific concerns leak outside the Twilio provider
- replyAddress abstraction is ready for Telegram chat IDs in Phase 15
- Notification pipeline will work with any messaging provider (guards removed, dependency-based availability)
- SMS-01 (configurable MMS_PIXEL_URL) and SMS-02 (splitForSms removal) are both complete

## Self-Check: PASSED

- All 6 modified files verified present on disk
- Commit fe984a8 verified in git log
- Commit 4ab7e61 verified in git log
- `npx tsc --noEmit` passes with zero errors
- `npm run build` passes

---
*Phase: 14-provider-generalization-sms-polish*
*Completed: 2026-02-15*

---
phase: 14-provider-generalization-sms-polish
plan: 01
subsystem: messaging
tags: [twilio, messaging-provider, interface-generalization, telegram-prep]

# Dependency graph
requires:
  - phase: 02-twilio-webhook
    provides: Original TwilioMessagingProvider and MessagingProvider interface
provides:
  - Provider-agnostic MessagingProvider interface (providerName, formatWebhookResponse, generic validateWebhook/parseInbound)
  - TwilioMessagingProvider with encapsulated sender identity (fromNumber/messagingServiceSid in constructor)
  - TwilioOutboundMessage type for Twilio-specific rich card fields
  - Config schema with MMS_PIXEL_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET
  - All consumers updated to use provider-agnostic send() (no from field)
affects: [15-telegram-provider, 16-telegram-conversations, messaging, webhook]

# Tech tracking
tech-stack:
  added: []
  patterns: [provider-encapsulated-sender-identity, generic-webhook-validation, provider-specific-type-extension]

key-files:
  created: []
  modified:
    - src/messaging/types.ts
    - src/messaging/twilio-provider.ts
    - src/config.ts
    - src/plugins/messaging.ts
    - src/plugins/webhook.ts
    - src/conversation/engine.ts
    - src/conversation/message-formatter.ts
    - src/notifications/notify.ts
    - src/users/onboarding.ts
    - src/conversation/tools/add-movie.ts
    - src/conversation/tools/add-series.ts

key-decisions:
  - "Provider encapsulates sender identity: fromNumber/messagingServiceSid moved to TwilioMessagingProvider constructor, callers never pass from"
  - "TwilioOutboundMessage extends OutboundMessage for Twilio-specific rich card fields (contentSid/contentVariables)"
  - "formatWebhookResponse returns string|null -- Twilio always returns TwiML, Telegram will return null (sends via API)"
  - "MMS pixel URL moved from hardcoded URL to configurable MMS_PIXEL_URL env var"

patterns-established:
  - "Provider-specific types extend shared types: TwilioOutboundMessage extends OutboundMessage"
  - "Sender identity encapsulated in provider constructor, never passed by callers"
  - "Webhook validation uses generic headers/body/url params, provider extracts what it needs"
  - "formatWebhookResponse(text?) replaces separate formatReply/formatEmptyReply methods"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 14 Plan 01: Provider Generalization Summary

**Provider-agnostic MessagingProvider interface with encapsulated sender identity, generic webhook validation, and Telegram config vars**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T14:25:05Z
- **Completed:** 2026-02-15T14:28:36Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Generalized MessagingProvider interface: removed all TwiML-specific method names and Twilio-specific parameter shapes
- TwilioMessagingProvider now encapsulates from address internally -- 7 consumer files updated to remove `from` field from send() calls
- Added MMS_PIXEL_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET to config schema
- Replaced hardcoded MMS pixel URL with configurable env var
- Entire project compiles cleanly with zero type errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Generalize MessagingProvider interface and message types** - `02bfa65` (feat)
2. **Task 2: Update TwilioMessagingProvider and config** - `726fa45` (feat)

## Files Created/Modified
- `src/messaging/types.ts` - Provider-agnostic MessagingProvider, OutboundMessage (no from), InboundMessage (providerMessageId), WebhookValidationParams, SendResult
- `src/messaging/twilio-provider.ts` - TwilioMessagingProvider with encapsulated fromNumber/messagingServiceSid, TwilioOutboundMessage type, formatWebhookResponse
- `src/config.ts` - Added MMS_PIXEL_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET env vars
- `src/plugins/messaging.ts` - Passes fromNumber and messagingServiceSid to TwilioMessagingProvider constructor
- `src/plugins/webhook.ts` - Uses formatWebhookResponse, generic validateWebhook with headers/body
- `src/conversation/engine.ts` - Removed from: from all send() calls, uses config.MMS_PIXEL_URL
- `src/conversation/message-formatter.ts` - Uses TwilioOutboundMessage for rich card sends
- `src/notifications/notify.ts` - Removed from: from send() calls
- `src/users/onboarding.ts` - Removed from: from send() calls
- `src/conversation/tools/add-movie.ts` - Removed from: from admin notification send()
- `src/conversation/tools/add-series.ts` - Removed from: from admin notification send()

## Decisions Made
- **Provider encapsulates sender identity**: fromNumber and messagingServiceSid are constructor params, never passed by callers. This is the key design decision enabling provider-agnostic code.
- **TwilioOutboundMessage extends OutboundMessage**: Keeps shared interface clean while allowing Twilio-specific rich card fields (contentSid, contentVariables) in the provider module.
- **formatWebhookResponse returns string|null**: Twilio always returns TwiML (string), but Telegram will return null since it sends replies via Bot API, not webhook response body.
- **MMS pixel URL configurable**: Moved from hardcoded URL to MMS_PIXEL_URL env var, with conditional send (only attaches media if URL is configured).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated all consumer files to compile with new interface**
- **Found during:** Task 2
- **Issue:** The plan scoped Task 2 to twilio-provider.ts, config.ts, and messaging.ts, but 7 additional consumer files referenced the old interface (from: in send() calls, formatReply/formatEmptyReply, old validateWebhook params)
- **Fix:** Updated webhook.ts, engine.ts, message-formatter.ts, notify.ts, onboarding.ts, add-movie.ts, add-series.ts to use the new interface
- **Files modified:** src/plugins/webhook.ts, src/conversation/engine.ts, src/conversation/message-formatter.ts, src/notifications/notify.ts, src/users/onboarding.ts, src/conversation/tools/add-movie.ts, src/conversation/tools/add-series.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** 726fa45 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for compilation -- interface changes required all consumers to update simultaneously. No scope creep.

## Issues Encountered
None

## User Setup Required
New optional environment variables available:
- `MMS_PIXEL_URL` - URL to a transparent pixel image for forcing MMS mode on long messages (previously hardcoded)
- `TELEGRAM_BOT_TOKEN` - Telegram Bot API token (Phase 15)
- `TELEGRAM_WEBHOOK_SECRET` - Telegram webhook verification secret (Phase 15)

## Next Phase Readiness
- MessagingProvider interface is fully provider-agnostic, ready for TelegramMessagingProvider implementation in Phase 15
- Config schema has Telegram env vars ready
- All consumer code uses the generic interface -- no Twilio-specific assumptions leak through

## Self-Check: PASSED

- All 11 modified files verified present on disk
- Commit 02bfa65 verified in git log
- Commit 726fa45 verified in git log
- `npx tsc --noEmit` passes with zero errors

---
*Phase: 14-provider-generalization-sms-polish*
*Completed: 2026-02-15*

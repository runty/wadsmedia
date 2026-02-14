---
phase: 02-messaging-gateway
plan: 02
subsystem: messaging
tags: [twilio, fastify-plugin, webhook, formbody, twiml, signature-validation]

# Dependency graph
requires:
  - phase: 02-messaging-gateway
    plan: 01
    provides: "MessagingProvider interface and TwilioMessagingProvider adapter"
  - phase: 01-foundation
    provides: "Fastify server, config, database and health plugins"
provides:
  - "Fastify messaging plugin decorating instance with MessagingProvider"
  - "POST /webhook/twilio route with Twilio signature validation"
  - "formbody parsing for form-encoded webhook bodies"
  - "TWILIO_MESSAGING_SERVICE_SID optional config for RCS fallback"
affects: [03-users, 05-conversation-engine]

# Tech tracking
tech-stack:
  added: ["@fastify/formbody@8.x"]
  patterns: [Fastify preHandler hook for webhook signature validation, URL reconstruction with x-forwarded-proto for reverse proxy support]

key-files:
  created:
    - src/plugins/messaging.ts
    - src/plugins/webhook.ts
  modified:
    - src/config.ts
    - src/server.ts
    - package.json
    - package-lock.json

key-decisions:
  - "Keep Twilio env vars optional in Zod schema; validate at messaging plugin registration time for backward compat"
  - "Reconstruct webhook URL from x-forwarded-proto and host headers for signature validation behind reverse proxy"

patterns-established:
  - "Webhook signature validation via Fastify preHandler hook (reusable for future webhook endpoints)"
  - "Plugin registration order: infrastructure (db, health) then middleware (formbody) then domain (messaging, webhook)"

# Metrics
duration: 2min
completed: 2026-02-14
---

# Phase 2 Plan 2: Messaging Fastify Plugins and Webhook Endpoint Summary

**Fastify plugins wiring TwilioMessagingProvider into the server with POST /webhook/twilio, HMAC signature validation preHandler, and formbody parsing**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-14T02:08:31Z
- **Completed:** 2026-02-14T02:10:09Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Messaging Fastify plugin validates Twilio credentials at registration and decorates fastify.messaging
- Webhook plugin registers POST /webhook/twilio with signature validation preHandler that rejects invalid/missing signatures with 403
- URL reconstruction uses x-forwarded-proto for correct signature validation behind reverse proxy/SSL termination
- Config updated with optional TWILIO_MESSAGING_SERVICE_SID for RCS+SMS fallback via Twilio Messaging Services
- Server registers formbody before webhook to ensure form-encoded body parsing is available

## Task Commits

Each task was committed atomically:

1. **Task 1: Create messaging and webhook Fastify plugins** - `af15697` (feat)
2. **Task 2: Update config and server to register messaging plugins** - `6fbbadf` (feat)

## Files Created/Modified
- `src/plugins/messaging.ts` - Fastify plugin decorating instance with TwilioMessagingProvider, validates credentials at startup
- `src/plugins/webhook.ts` - POST /webhook/twilio route with validateTwilioSignature preHandler, responds with TwiML XML
- `src/config.ts` - Added TWILIO_MESSAGING_SERVICE_SID as optional field in Zod env schema
- `src/server.ts` - Imports and registers formbody, messagingPlugin, webhookPlugin in correct dependency order
- `package.json` - Added @fastify/formbody dependency
- `package-lock.json` - Lock file updated

## Decisions Made
- **Credential validation at plugin registration:** Kept Twilio env vars optional in Zod schema (preserving Phase 1 standalone operation) but throw a clear error at messaging plugin registration if TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN are missing.
- **URL reconstruction for signature validation:** Used x-forwarded-proto header (defaulting to "http") with host header to reconstruct the full webhook URL, ensuring HMAC signature validation works correctly behind Docker/nginx SSL termination.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - Twilio credentials are validated at runtime but not required for build/lint. When deploying, users need TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables and must configure their Twilio phone number's webhook URL to point to POST /webhook/twilio.

## Next Phase Readiness
- Full messaging gateway complete: inbound webhook with signature validation, provider on Fastify instance for outbound use
- Ready for Phase 3 (Users) -- phone whitelist authorization can wrap the webhook endpoint
- Ready for Phase 5 (Conversation Engine) -- can parse inbound messages and send replies through fastify.messaging

## Self-Check: PASSED

- [x] src/plugins/messaging.ts exists
- [x] src/plugins/webhook.ts exists
- [x] Commit af15697 exists (Task 1)
- [x] Commit 6fbbadf exists (Task 2)
- [x] npm run build passes
- [x] npm run check passes (Biome)

---
*Phase: 02-messaging-gateway*
*Completed: 2026-02-14*

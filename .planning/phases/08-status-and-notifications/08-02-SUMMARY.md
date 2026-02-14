---
phase: 08-status-and-notifications
plan: 02
subsystem: notifications
tags: [webhooks, sonarr, radarr, sms, twilio, fastify-plugin]

# Dependency graph
requires:
  - phase: 02-messaging-gateway
    provides: "MessagingProvider interface and Twilio send()"
  - phase: 03-user-management
    provides: "Users table with status field for active user queries"
provides:
  - "Sonarr/Radarr webhook payload type definitions"
  - "Template-based notification message formatters for Download and Grab events"
  - "notifyAllActiveUsers dispatcher for SMS fan-out to active users"
  - "/webhook/sonarr and /webhook/radarr POST routes with token auth"
  - "NOTIFICATION_SECRET config for webhook security"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fire-and-forget webhook response pattern (respond 200, dispatch async)"
    - "Token-based webhook auth via query parameter preHandler"
    - "Graceful plugin skip when TWILIO_PHONE_NUMBER not configured"

key-files:
  created:
    - src/notifications/types.ts
    - src/notifications/formatters.ts
    - src/notifications/notify.ts
    - src/plugins/notifications.ts
  modified:
    - src/config.ts
    - src/server.ts

key-decisions:
  - "TypeScript interfaces (not Zod) for webhook payloads since external schemas are underdocumented"
  - "Token auth via ?token= query param (simple, works with Sonarr/Radarr webhook config)"
  - "Fire-and-forget dispatch: webhook responds 200 immediately, SMS sent asynchronously"
  - "Only Download and Grab events generate notifications; all others return null (silent skip)"

patterns-established:
  - "Notification dispatcher as pure function with db, messaging, config, message, log parameters"
  - "Webhook token validation as Fastify preHandler hook"

# Metrics
duration: 2min
completed: 2026-02-14
---

# Phase 8 Plan 2: Proactive Notifications Summary

**Webhook-driven SMS notification service receiving Sonarr/Radarr events and dispatching to all active users via template-based formatters**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-14T16:01:59Z
- **Completed:** 2026-02-14T16:04:05Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Sonarr and Radarr webhook payload type definitions with optional fields for version resilience
- Template-based message formatters producing concise SMS strings for Download and Grab events
- User notification dispatcher querying active users and sending SMS via existing Twilio infrastructure
- Fastify plugin with /webhook/sonarr and /webhook/radarr routes, token-secured via preHandler
- NOTIFICATION_SECRET optional config for webhook authentication

## Task Commits

Each task was committed atomically:

1. **Task 1: Create notification types, formatters, and dispatcher** - `4895208` (feat)
2. **Task 2: Create notifications Fastify plugin with webhook routes** - `478f48b` (feat)

## Files Created/Modified
- `src/notifications/types.ts` - Sonarr and Radarr webhook payload TypeScript interfaces
- `src/notifications/formatters.ts` - Template-based message formatters for Download and Grab events
- `src/notifications/notify.ts` - Notification dispatcher to all active users via SMS
- `src/plugins/notifications.ts` - Fastify plugin with webhook routes and token auth
- `src/config.ts` - Added NOTIFICATION_SECRET optional env var
- `src/server.ts` - Imported and registered notificationsPlugin

## Decisions Made
- Used TypeScript interfaces (not Zod schemas) for webhook payloads since Sonarr/Radarr schemas are underdocumented and vary between versions
- Token authentication via `?token=` query parameter -- simple approach that works directly with Sonarr/Radarr webhook URL configuration
- Fire-and-forget notification dispatch -- webhook responds 200 immediately, SMS notifications sent asynchronously to avoid blocking the external service
- Only Download and Grab event types generate notifications; all others (Rename, Health, Test, etc.) silently return null

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration:**
- **NOTIFICATION_SECRET:** Generate a random string (`openssl rand -hex 32`) and set in `.env`
- **Sonarr:** Settings -> Connect -> + -> Webhook: URL `http://<wadsmedia-host>:3000/webhook/sonarr?token=<NOTIFICATION_SECRET>`, Events: On Grab + On Import
- **Radarr:** Settings -> Connect -> + -> Webhook: URL `http://<wadsmedia-host>:3000/webhook/radarr?token=<NOTIFICATION_SECRET>`, Events: On Grab + On Import

## Next Phase Readiness
- STAT-03 (proactive notifications) fully satisfied
- Phase 8 complete -- all status and notification functionality delivered
- No blockers or concerns

## Self-Check: PASSED

All 4 created files verified on disk. Both task commits (4895208, 478f48b) verified in git log.

---
*Phase: 08-status-and-notifications*
*Completed: 2026-02-14*

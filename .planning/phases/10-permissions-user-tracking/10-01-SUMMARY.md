---
phase: 10-permissions-user-tracking
plan: 01
subsystem: auth, api, database
tags: [rbac, permissions, drizzle, sqlite, twilio, sms, media-tracking]

# Dependency graph
requires:
  - phase: 05-conversation-engine
    provides: "ToolDefinition, ToolContext, tool-loop, defineTool(), ToolRegistry"
  - phase: 03-user-management
    provides: "users table with isAdmin column, User type, user-resolver"
  - phase: 02-messaging-gateway
    provides: "MessagingProvider.send() for admin SMS notification"
provides:
  - "RequiredRole type and requiredRole field on ToolDefinition"
  - "Centralized permission guard in tool-loop.ts (before destructive check)"
  - "Extended ToolContext with isAdmin, displayName, userPhone, messaging, db"
  - "media_tracking table with Drizzle migration"
  - "insertMediaTracking function for per-user media tracking"
  - "Admin SMS notification on non-admin media additions"
affects: [12-dashboard, 13-rcs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Centralized permission check in tool-loop (requiredRole on ToolDefinition)"
    - "Fire-and-forget notification pattern (.catch(() => {}))"
    - "Post-execution hook pattern in tool executors for tracking/notification"

key-files:
  created:
    - src/users/media-tracking.ts
    - drizzle/0003_quiet_makkari.sql
  modified:
    - src/conversation/types.ts
    - src/conversation/tools.ts
    - src/conversation/tool-loop.ts
    - src/conversation/engine.ts
    - src/plugins/webhook.ts
    - src/conversation/tools/remove-movie.ts
    - src/conversation/tools/remove-series.ts
    - src/conversation/system-prompt.ts
    - src/db/schema.ts
    - src/conversation/tools/add-movie.ts
    - src/conversation/tools/add-series.ts

key-decisions:
  - "Permission enforcement at execution layer (tool-loop.ts), not system prompt or per-tool"
  - "requiredRole defaults to 'any' -- existing tools unchanged, only remove tools set to 'admin'"
  - "Admin notification is fire-and-forget -- add succeeds even if Twilio is down"
  - "media_tracking stores tmdbId for movies and tvdbId for series; mediaType column disambiguates"

patterns-established:
  - "requiredRole on ToolDefinition: centralized permission gating in tool-loop"
  - "Post-execution tracking: inline tracking/notification in tool executors after successful action"
  - "Fire-and-forget notification: .catch(() => {}) for best-effort SMS"

# Metrics
duration: 4min
completed: 2026-02-14
---

# Phase 10 Plan 01: Permissions + User Tracking Summary

**Role-based permission guard with centralized tool-loop enforcement, media_tracking table, and fire-and-forget admin SMS notification on non-admin adds**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-14T23:51:57Z
- **Completed:** 2026-02-14T23:55:59Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Centralized permission guard in tool-loop.ts blocks non-admin users from admin-only tools BEFORE destructive confirmation prompt
- media_tracking table tracks every media addition with userId, mediaType, title, year, externalId, and timestamp
- Non-admin media additions trigger SMS notification to admin phone (fire-and-forget)
- All existing tools continue to work unchanged via safe 'any' default on requiredRole

## Task Commits

Each task was committed atomically:

1. **Task 1: Permission guard infrastructure with requiredRole enforcement** - `ee85904` (feat)
2. **Task 2: Media tracking table, tracking inserts, and admin notification on add** - `deaf3c8` (feat)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `src/conversation/types.ts` - Added RequiredRole type, requiredRole on ToolDefinition, extended ToolContext with isAdmin/displayName/userPhone/messaging/db
- `src/conversation/tools.ts` - Added requiredRole parameter to defineTool() with 'any' default
- `src/conversation/tool-loop.ts` - Injected permission check between Zod validation and destructive tier check
- `src/conversation/engine.ts` - Added isAdmin to ProcessConversationParams, wired into both ToolContext construction sites
- `src/plugins/webhook.ts` - Passes user.isAdmin to processConversation()
- `src/conversation/tools/remove-movie.ts` - Tagged with requiredRole: 'admin'
- `src/conversation/tools/remove-series.ts` - Tagged with requiredRole: 'admin'
- `src/conversation/system-prompt.ts` - Added permissions guidance section
- `src/db/schema.ts` - Added media_tracking table definition
- `drizzle/0003_quiet_makkari.sql` - Migration SQL for media_tracking table (additive only)
- `src/users/media-tracking.ts` - insertMediaTracking function following user.service.ts pattern
- `src/conversation/tools/add-movie.ts` - Added tracking insert + admin notification after successful add
- `src/conversation/tools/add-series.ts` - Added tracking insert + admin notification after successful add

## Decisions Made
- Permission enforcement at execution layer (tool-loop.ts), not system prompt or per-tool -- matches ARCHITECTURE.md and PITFALLS.md guidance
- requiredRole defaults to 'any' via defineTool() default parameter -- no changes needed to existing tools
- Admin notification is fire-and-forget (.catch(() => {})) -- add operation succeeds even if Twilio is down
- media_tracking stores tmdbId for movies, tvdbId for series -- mediaType column disambiguates ID system
- System prompt includes permissions section for UX polish (not security) -- helps LLM suggest alternatives instead of remove actions for non-admins

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Biome formatter required multi-line formatting for the expanded ToolContext object in engine.ts -- fixed inline during Task 2

## User Setup Required
None - no external service configuration required. media_tracking migration applies automatically on next startup.

## Next Phase Readiness
- Permission infrastructure complete for all current and future tools
- media_tracking table ready for Phase 12 dashboard consumption
- Admin notification system operational for non-admin adds

## Self-Check: PASSED

All 13 files verified present. Both task commits (ee85904, deaf3c8) verified in git log.

---
*Phase: 10-permissions-user-tracking*
*Completed: 2026-02-14*

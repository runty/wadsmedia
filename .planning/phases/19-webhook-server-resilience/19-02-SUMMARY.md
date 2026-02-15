---
phase: 19-webhook-server-resilience
plan: 02
subsystem: observability
tags: [health-check, webhook, llm, error-rate, fastify, openai, grammy]

# Dependency graph
requires:
  - phase: 19-webhook-server-resilience
    plan: 01
    provides: getWebhookInfo method on TelegramMessagingProvider for webhook status
  - phase: 06-telegram-bot
    provides: TelegramMessagingProvider and Fastify decorator
  - phase: 05-llm
    provides: OpenAI client as fastify.llm decorator
provides:
  - Structured health endpoint with database, webhook, LLM, and error rate checks
  - In-memory sliding-window error rate tracker with 5-minute window
  - Exported recordError() function for manual error tracking
affects: [monitoring, deployment, operations]

# Tech tracking
tech-stack:
  added: []
  patterns: [sliding-window error counter with timestamp pruning, parallel health checks via Promise.allSettled, graceful degradation for optional subsystems]

key-files:
  created: []
  modified:
    - src/plugins/health.ts

key-decisions:
  - "Promise.race timeout for grammy webhook check (5s) since grammy API does not natively support request timeout options"
  - "OpenAI SDK timeout option (5s with maxRetries: 0) for LLM check to prevent health endpoint hanging"
  - "Non-configured services report not_configured without degrading overall status"
  - "Error rate threshold of 10 errors in 5 minutes before flagging as elevated"

patterns-established:
  - "Health check pattern: parallel external checks via Promise.allSettled, graceful handling of optional decorators"
  - "Error rate tracking: module-scope timestamp array with splice-based pruning, same pattern as group chat rate limiter"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 19 Plan 02: Structured Health Checks Summary

**GET /health returns parallel-checked status for database, Telegram webhook, LLM reachability, and 5-minute error rate with graceful degradation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T23:43:43Z
- **Completed:** 2026-02-15T23:47:05Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Health endpoint expanded from database-only to four-check structured response (database, telegram_webhook, llm, error_rate)
- In-memory sliding-window error rate tracker records both 5xx responses (onResponse hook) and caught errors (onError hook) in a 5-minute window
- Telegram webhook check validates URL matches expected config and reports pending_update_count and last_error_message
- LLM check confirms API reachability via models.list() with 5s timeout and no retries
- External checks run in parallel via Promise.allSettled to prevent one slow check blocking the other
- Non-configured services return "not_configured" without degrading overall status; configured failures degrade to 503

## Task Commits

Each task was committed atomically:

1. **Task 1: Add error rate tracking to the health plugin** - `2df3d58` (feat)
2. **Task 2: Expand health endpoint with webhook, LLM, and error rate checks** - `5c77b18` (feat)

## Files Created/Modified
- `src/plugins/health.ts` - Expanded from 29-line database-only check to 172-line comprehensive health endpoint with error rate tracking, webhook validation, and LLM reachability

## Decisions Made
- Used Promise.race with 5s timeout for grammy webhook check since grammy API accepts AbortSignal but our provider wrapper doesn't forward it
- Used OpenAI SDK's built-in timeout option (5000ms) with maxRetries: 0 for LLM health check
- Used fastify.hasDecorator("llm") for safe runtime check since llm is typed as non-optional but conditionally decorated
- Error rate threshold set at >10 errors per 5-minute window to flag as "elevated"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict index access error**
- **Found during:** Task 1 (error rate tracking)
- **Issue:** `errorTimestamps[i]` flagged as possibly undefined under strict mode
- **Fix:** Used nullish coalescing `(errorTimestamps[i] ?? 0)` for safe comparison
- **Files modified:** src/plugins/health.ts
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** `2df3d58` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Minor TypeScript strictness fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 19 (Webhook Server Resilience) is fully complete
- Health endpoint provides comprehensive system status at a glance for operators
- Error rate tracking is available for future alerting/monitoring integration
- No blockers for continuing to Phase 20

## Self-Check: PASSED

All files exist and all commits verified.

---
*Phase: 19-webhook-server-resilience*
*Completed: 2026-02-15*

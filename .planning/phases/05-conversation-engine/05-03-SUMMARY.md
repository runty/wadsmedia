---
phase: 05-conversation-engine
plan: 03
subsystem: conversation
tags: [openai, fastify-plugin, webhook, confirmation-tier, fire-and-forget]

# Dependency graph
requires:
  - phase: 05-conversation-engine
    plan: 01
    provides: "LLM client factory, conversation history CRUD, system prompt, messages/pendingActions tables"
  - phase: 05-conversation-engine
    plan: 02
    provides: "Tool registry, tool call loop with confirmation interception"
  - phase: 02-messaging-gateway
    provides: "MessagingProvider with send() and formatEmptyReply()"
  - phase: 03-user-management
    provides: "User resolver, onboarding handler, user status model"
provides:
  - "Pending action CRUD with upsert, expiry, and yes/no detection"
  - "processConversation top-level orchestrator wiring history, LLM, tools, and messaging"
  - "Fastify conversation plugin decorating llm and toolRegistry"
  - "Webhook handler wiring active users to async conversation processing"
  - "Graceful degradation when LLM is not configured"
affects: [06-search-tools, 07-library-tools, 08-status-notifications]

# Tech tracking
tech-stack:
  added: []
  patterns: [fire-and-forget-webhook, confirmation-tier-system, graceful-degradation-plugin]

key-files:
  created:
    - src/conversation/confirmation.ts
    - src/conversation/engine.ts
    - src/plugins/conversation.ts
  modified:
    - src/plugins/webhook.ts
    - src/server.ts

key-decisions:
  - "Webhook responds immediately with empty TwiML then processes conversation asynchronously (fire-and-forget)"
  - "Conversation plugin uses same graceful-skip pattern as sonarr/radarr when LLM unconfigured"
  - "Pending action upsert via onConflictDoUpdate on userId unique constraint (one pending action per user)"
  - "Unrelated messages clear stale pending actions and fall through to normal LLM processing"

patterns-established:
  - "Fire-and-forget webhook: respond to Twilio immediately, process asynchronously, send reply as outbound message"
  - "Confirmation tier: destructive actions intercepted in tool loop, stored in DB, resolved on next yes/no message"
  - "Engine orchestrator pattern: top-level async function composing confirmation check, history, LLM, persistence, and messaging"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 5 Plan 3: Conversation Engine Integration Summary

**End-to-end conversation pipeline wiring webhook to LLM via confirmation tier, async processing, and fire-and-forget TwiML response**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T03:49:04Z
- **Completed:** 2026-02-14T03:51:46Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Built confirmation module with pending action CRUD (upsert, expiry, cleanup) and yes/no/unrelated message detection
- Created processConversation orchestrator wiring confirmation check, history load, LLM tool call loop, message persistence, and reply send into a single async flow
- Fastify conversation plugin creates LLM client and tool registry with graceful degradation when unconfigured
- Webhook handler now responds immediately with empty TwiML (avoiding Twilio 15s timeout) and processes conversation asynchronously
- Replaced Phase 3 placeholder "Conversation features coming soon!" with full LLM-powered conversation processing

## Task Commits

Each task was committed atomically:

1. **Task 1: Confirmation tier and conversation engine orchestrator** - `49523e6` (feat)
2. **Task 2: Fastify plugin and webhook integration** - `726c3e3` (feat)

## Files Created/Modified
- `src/conversation/confirmation.ts` - Pending action CRUD (save, get, clear, clearExpired) and yes/no detection
- `src/conversation/engine.ts` - processConversation orchestrator: confirmation check, history, LLM loop, persistence, reply
- `src/plugins/conversation.ts` - Fastify plugin: LLM client and tool registry decoration with graceful skip
- `src/plugins/webhook.ts` - Updated active user handler: empty TwiML response + async processConversation
- `src/server.ts` - Registered conversation plugin between radarr and formbody plugins

## Decisions Made
- Webhook responds immediately with empty TwiML then fires processConversation as fire-and-forget -- Twilio gets a 200 within milliseconds, LLM reply comes as a separate outbound SMS
- Conversation plugin follows same graceful-skip pattern as sonarr/radarr plugins when LLM_API_KEY and LLM_BASE_URL are both missing
- Pending action uses upsert (onConflictDoUpdate on userId unique constraint) so a new destructive action replaces any existing one for the same user
- When user sends an unrelated message while a pending action exists, the pending action is cleared and the message is processed normally through the LLM

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no new external service configuration required. LLM credentials (LLM_API_KEY, LLM_BASE_URL, LLM_MODEL) were defined in config.ts during Phase 1 as optional env vars.

## Next Phase Readiness
- Conversation engine is fully wired end-to-end: active users who text get LLM-powered responses with tool calling
- Tool registry ready for Phase 6 (search tools) and Phase 7 (library management tools) to register new tools via defineTool + registry.register()
- Confirmation tier pipeline ready for destructive tools (remove series, remove movie) in Phase 7
- Phase 5 (Conversation Engine) is now complete -- all 3 plans executed

## Self-Check: PASSED

All 5 files verified present on disk. Both commit hashes (49523e6, 726c3e3) verified in git log.

---
*Phase: 05-conversation-engine*
*Completed: 2026-02-14*

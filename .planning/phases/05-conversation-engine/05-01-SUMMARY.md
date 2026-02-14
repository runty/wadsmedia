---
phase: 05-conversation-engine
plan: 01
subsystem: conversation
tags: [openai, llm, sqlite, drizzle, sliding-window, tool-calls]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Database plugin, Drizzle ORM, config schema"
  - phase: 03-user-management
    provides: "Users table and user service pattern (pure functions with db param)"
  - phase: 04-media-server-clients
    provides: "SonarrClient and RadarrClient types for ToolContext"
provides:
  - "messages and pendingActions database tables"
  - "ChatMessage, ToolDefinition, ToolContext, ToolCallLoopResult, PendingAction types"
  - "createLLMClient factory for OpenAI-compatible providers"
  - "saveMessage, getHistory, buildLLMMessages, clearHistory conversation history CRUD"
  - "SYSTEM_PROMPT and buildSystemPrompt with personalization"
affects: [05-conversation-engine]

# Tech tracking
tech-stack:
  added: [openai]
  patterns: [sliding-window-tool-boundary, openai-compatible-llm-factory]

key-files:
  created:
    - src/conversation/types.ts
    - src/conversation/llm.ts
    - src/conversation/history.ts
    - src/conversation/system-prompt.ts
    - drizzle/0002_perpetual_mentor.sql
  modified:
    - src/db/schema.ts
    - package.json

key-decisions:
  - "OpenAI SDK used directly (no wrapper class) -- factory function returns raw OpenAI client"
  - "Sliding window works backward from most recent messages, pulling in full tool call groups atomically"
  - "getHistory fetches all rows then slices last N (simple for SQLite scale, avoids subquery complexity)"

patterns-established:
  - "Conversation module uses same pure-function-with-db-param pattern as user.service.ts"
  - "Tool call boundary preservation: assistant + tool results always included as atomic group in window"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 5 Plan 1: Conversation Data Layer Summary

**SQLite message persistence with OpenAI-compatible LLM client and sliding window history that preserves tool call boundaries**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T03:37:47Z
- **Completed:** 2026-02-14T03:40:24Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Extended database schema with messages table (per-user conversation history with tool call support) and pendingActions table (one pending destructive action per user with expiry)
- Created shared types (ChatMessage, ToolDefinition, ToolContext, ToolCallLoopResult, PendingAction) with OpenAI SDK type re-exports
- Built LLM client factory supporting OpenAI, Ollama, and any OpenAI-compatible provider via configurable baseURL
- Implemented conversation history module with sliding window that atomically includes tool call groups (assistant + tool results never split)
- System prompt with SMS-optimized guidelines and optional user name personalization

## Task Commits

Each task was committed atomically:

1. **Task 1: Database schema and conversation types** - `f81ca02` (feat)
2. **Task 2: LLM client, conversation history, and system prompt** - `7b24800` (feat)

## Files Created/Modified
- `src/db/schema.ts` - Added messages and pendingActions table definitions
- `src/conversation/types.ts` - Shared types: ChatMessage, ToolDefinition, ToolContext, PendingAction, ToolCallLoopResult
- `src/conversation/llm.ts` - OpenAI SDK client factory with configurable provider
- `src/conversation/history.ts` - saveMessage, getHistory, buildLLMMessages (sliding window), clearHistory
- `src/conversation/system-prompt.ts` - SYSTEM_PROMPT constant and buildSystemPrompt with name personalization
- `drizzle/0002_perpetual_mentor.sql` - Migration for messages and pending_actions tables
- `package.json` - Added openai dependency

## Decisions Made
- OpenAI SDK used directly via factory function (no wrapper class) -- the SDK handles retries, types, and errors natively
- Sliding window algorithm works backward from most recent messages, pulling in complete tool call groups atomically to avoid orphaned tool results
- getHistory fetches all rows then slices last N (simple approach suitable for SQLite scale, avoids subquery complexity in Drizzle)
- apiKey defaults to "not-needed" when unset to support Ollama which ignores the key

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. LLM credentials (LLM_API_KEY, LLM_BASE_URL, LLM_MODEL) are already defined in config.ts from Phase 1 as optional env vars.

## Next Phase Readiness
- Message persistence and history retrieval ready for tool call loop (Plan 05-02)
- LLM client factory ready for chat completion calls
- System prompt ready with personalization support
- All types exported for downstream consumption

## Self-Check: PASSED

All 6 files verified present on disk. Both commit hashes (f81ca02, 7b24800) verified in git log.

---
*Phase: 05-conversation-engine*
*Completed: 2026-02-14*

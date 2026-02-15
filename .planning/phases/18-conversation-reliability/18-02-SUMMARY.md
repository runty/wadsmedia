---
phase: 18-conversation-reliability
plan: 02
subsystem: conversation
tags: [concurrency, async-lock, race-condition, deferred-persistence, vitest]

# Dependency graph
requires:
  - phase: 05-conversation-engine
    provides: "processConversation orchestrator, toolCallLoop, message persistence"
  - phase: 18-conversation-reliability-01
    provides: "pruneOrphanedUserMessages, buildLLMMessages integration"
provides:
  - "withConversationLock: per-user/group async serialization via promise chaining"
  - "Verified deferred user message persistence (save after toolCallLoop, not before)"
  - "Unit test suite for conversation lock and deferred persistence (9 tests)"
affects: [conversation-engine, webhook, telegram-webhook]

# Tech tracking
tech-stack:
  added: []
  patterns: [promise-chain-lock, per-key-serialization, structural-code-assertions]

key-files:
  created:
    - src/conversation/engine.test.ts
  modified:
    - src/conversation/engine.ts

key-decisions:
  - "Promise chaining for lock instead of external dependency (Map<string, Promise<void>>)"
  - "Lock key is user:${userId} for DMs and group:${groupChatId} for group chats"
  - "Entire processConversation body including confirmation flows inside lock"
  - "Structural source assertions for deferred persistence (grep engine.ts) instead of full integration mocks"

patterns-established:
  - "Per-key promise chain lock: withConversationLock chains promises per key, different keys run in parallel"
  - "Structural code assertions: read source file in tests to verify code ordering invariants"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 18 Plan 02: Conversation Lock & Deferred Persistence Summary

**Per-user async conversation lock via promise chaining prevents rapid-message race conditions; deferred persistence verified by structural tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T23:25:27Z
- **Completed:** 2026-02-15T23:28:42Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added withConversationLock function using Map-based promise chaining for zero-dependency async serialization
- Wrapped entire processConversation body (including confirmation flows) inside the lock so all DB reads/writes for a user/group are serialized
- Different users and different groups still process fully in parallel (lock is per-key)
- Created 9 unit tests covering lock serialization, parallel execution, error recovery, value propagation, cleanup, and deferred persistence structural verification
- No new npm dependencies added

## Task Commits

Each task was committed atomically:

1. **Task 1: Per-user conversation lock in engine.ts** - `b06f0e7` (feat)
2. **Task 2: Test conversation lock and deferred persistence** - `74cfea8` (test)

## Files Created/Modified
- `src/conversation/engine.ts` - Added withConversationLock function and conversationLocks map; wrapped processConversation body in lock with debug logging
- `src/conversation/engine.test.ts` - 9 tests: 6 for withConversationLock (serialization, parallelism, error recovery, return values, cleanup) and 3 for deferred persistence structural verification

## Decisions Made
- Used promise chaining (Map<string, Promise<void>>) instead of an external mutex library -- zero dependencies, minimal code, correct behavior
- Lock key format: `user:${userId}` for DMs, `group:${groupChatId}` for group chats -- matches the conversation boundary
- Entire processConversation body including confirmation flows is inside the lock -- confirmation flows read/write history and need serialization too
- Used structural source assertions (reading engine.ts and checking line ordering) for deferred persistence tests since mocking the full processConversation dependency tree is impractical for unit tests

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Conversation processing is now race-condition safe for rapid messages
- All conversation reliability improvements from Phase 18 are complete (plan 01: orphaned message pruning, plan 02: conversation lock + deferred persistence verification)
- Ready for Phase 19

## Self-Check: PASSED

- [x] src/conversation/engine.ts modified with withConversationLock
- [x] src/conversation/engine.test.ts exists (159 lines, 9 tests)
- [x] Commit b06f0e7 (feat: conversation lock) exists
- [x] Commit 74cfea8 (test: lock and persistence tests) exists
- [x] 9/9 tests pass
- [x] TypeScript compiles cleanly
- [x] Biome passes on modified files

---
*Phase: 18-conversation-reliability*
*Completed: 2026-02-15*

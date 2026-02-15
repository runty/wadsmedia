---
phase: 18-conversation-reliability
plan: 01
subsystem: conversation
tags: [llm, history, pruning, sliding-window, pure-function, vitest]

# Dependency graph
requires:
  - phase: 05-conversation-engine
    provides: "buildLLMMessages, sanitizeToolCallSequences, ChatMessage type"
provides:
  - "pruneOrphanedUserMessages pure function for removing consecutive orphaned user messages"
  - "Integrated pruning in buildLLMMessages before sliding window application"
  - "Unit test suite for history pruning and window behavior (224 lines, 14 tests)"
affects: [conversation-engine, history, llm-context]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-function-preprocessing, tdd-red-green-refactor]

key-files:
  created:
    - src/conversation/history.test.ts
  modified:
    - src/conversation/history.ts

key-decisions:
  - "Tool messages do not break consecutive user runs -- they belong to their parent assistant message"
  - "Pruning applied before sliding window so window budget is not wasted on orphaned messages"
  - "Function operates on a copy to preserve immutability of stored history"

patterns-established:
  - "Pure function preprocessing: apply pruneOrphanedUserMessages before windowing in buildLLMMessages"
  - "Test-only ChatMessage factory: msg() helper creates minimal test fixtures without DB"

# Metrics
duration: 2min
completed: 2026-02-15
---

# Phase 18 Plan 01: Orphaned User Message Pruning Summary

**Pure function pruneOrphanedUserMessages removes consecutive user messages with no assistant response, integrated into buildLLMMessages before sliding window**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-15T23:21:08Z
- **Completed:** 2026-02-15T23:23:30Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Implemented pruneOrphanedUserMessages as an exported pure function that removes consecutive user messages, keeping only the last in each run
- Integrated pruning into buildLLMMessages as the first step after the empty check, before sliding window application
- Created comprehensive test suite with 14 tests covering all specified cases including edge cases, tool call pairs, immutability, and integration with buildLLMMessages
- TypeScript compiles cleanly with no errors

## Task Commits

Each task was committed atomically:

1. **Task 1: RED - Failing tests** - `865dc34` (test)
2. **Task 2: GREEN - Implementation** - `bde2086` (feat)

_Note: TDD plan -- no refactoring was needed, implementation was clean on first pass._

## Files Created/Modified
- `src/conversation/history.test.ts` - 224 lines, 14 tests covering pruneOrphanedUserMessages and buildLLMMessages integration
- `src/conversation/history.ts` - Added pruneOrphanedUserMessages function (67 lines) and integrated into buildLLMMessages

## Decisions Made
- Tool messages do not break consecutive user runs because they semantically belong to their parent assistant message; if a tool message appears between user messages, it is also orphaned and gets pruned
- Pruning is applied before the sliding window in buildLLMMessages so the window budget is not wasted on messages that would confuse the LLM
- The function operates on a copy (builds a new result array) to preserve immutability of the stored history

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test helper type for null content**
- **Found during:** Task 2 (GREEN - implementation)
- **Issue:** Test helper `msg()` typed content as `string` but ChatMessage.content is `string | null`, causing tsc error when testing assistant messages with null content
- **Fix:** Changed helper parameter type to `string | null`
- **Files modified:** src/conversation/history.test.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** bde2086 (part of GREEN task commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type fix in test helper. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- pruneOrphanedUserMessages is exported and available for any code that processes conversation history
- buildLLMMessages now automatically prunes orphaned messages, so all callers (engine.ts processConversation) benefit without changes
- Ready for Phase 18 Plan 02 (next conversation reliability improvements)

## Self-Check: PASSED

- [x] src/conversation/history.test.ts exists (224 lines)
- [x] src/conversation/history.ts modified with pruneOrphanedUserMessages
- [x] Commit 865dc34 (RED) exists
- [x] Commit bde2086 (GREEN) exists
- [x] 14/14 tests pass
- [x] TypeScript compiles cleanly

---
*Phase: 18-conversation-reliability*
*Completed: 2026-02-15*

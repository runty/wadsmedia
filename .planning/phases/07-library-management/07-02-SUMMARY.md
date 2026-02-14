---
phase: 07-library-management
plan: 02
subsystem: conversation
tags: [system-prompt, tool-registration, library-management, context-resolution, anaphoric-reference]

# Dependency graph
requires:
  - phase: 07-library-management
    provides: "addMovieTool, addSeriesTool, removeMovieTool, removeSeriesTool definitions and barrel index"
  - phase: 06-search-and-discovery
    provides: "System prompt structure (search behavior, response format sections) and initial tool registration pattern"
  - phase: 05-conversation-engine
    provides: "ToolRegistry, conversation plugin, system prompt builder"
provides:
  - "System prompt with library management guidance (tmdbId for add, libraryId for remove)"
  - "System prompt with conversational context resolution for anaphoric references"
  - "All 8 conversation tools registered in ToolRegistry (9 total with check_status)"
affects: [08-status-and-queue]

# Tech tracking
tech-stack:
  added: []
  patterns: ["LLM instruction-based context resolution (no custom code) for anaphoric references"]

key-files:
  created: []
  modified:
    - src/conversation/system-prompt.ts
    - src/plugins/conversation.ts

key-decisions:
  - "Context reference resolution (LIB-04) handled entirely through system prompt guidance, not custom code"
  - "System prompt instructs LLM to use tmdbId/tvdbId for add operations, libraryId for remove operations"

patterns-established:
  - "LLM-instruction-based disambiguation: Use system prompt to guide the LLM in resolving conversational references from its own message history rather than building custom resolution code"

# Metrics
duration: 1min
completed: 2026-02-14
---

# Phase 7 Plan 2: System Prompt and Tool Registration Summary

**System prompt extended with library management guidance and anaphoric reference resolution; all 8 conversation tools registered in ToolRegistry**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-14T04:46:24Z
- **Completed:** 2026-02-14T04:47:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Extended system prompt with library management section guiding LLM on correct ID usage (tmdbId for add, libraryId for remove)
- Added conversational context section enabling anaphoric reference resolution ("add that one", "the second one") through LLM instruction
- Registered all 4 library management tools in conversation plugin (addMovieTool, addSeriesTool, removeMovieTool, removeSeriesTool)

## Task Commits

Each task was committed atomically:

1. **Task 1: Update system prompt with library management and context resolution guidance** - `2026e00` (feat)
2. **Task 2: Register all four library management tools in conversation plugin** - `35c151a` (feat)

## Files Created/Modified
- `src/conversation/system-prompt.ts` - Added library management and conversational context sections to system prompt
- `src/plugins/conversation.ts` - Imported and registered all 4 new library management tools (8 total registrations)

## Decisions Made
- Context reference resolution (LIB-04) handled entirely through system prompt guidance -- the LLM reads its own conversation history where search results with numbered items and IDs are preserved, so no custom resolution code is needed
- System prompt explicitly differentiates ID types: tmdbId/tvdbId for add operations, libraryId for remove operations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All library management functionality complete: tool definitions, system prompt guidance, and tool registration
- Phase 7 (Library Management) is fully complete
- Ready for Phase 8 (Status and Queue) -- the final phase

## Self-Check: PASSED

All modified files verified on disk. Both task commits (2026e00, 35c151a) verified in git log.

---
*Phase: 07-library-management*
*Completed: 2026-02-14*

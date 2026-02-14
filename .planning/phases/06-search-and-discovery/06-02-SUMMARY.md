---
phase: 06-search-and-discovery
plan: 02
subsystem: conversation
tags: [system-prompt, tool-registration, llm, search, ambiguity-resolution, sms]

# Dependency graph
requires:
  - phase: 05-conversation-engine
    provides: "ToolRegistry, createToolRegistry(), conversation plugin with LLM client"
  - phase: 06-search-and-discovery
    plan: 01
    provides: "searchMoviesTool, searchSeriesTool, getUpcomingEpisodesTool, getUpcomingMoviesTool definitions"
provides:
  - "System prompt with search behavior guidance, ambiguity resolution, and SMS-friendly formatting rules"
  - "All four search/discovery tools registered in conversation plugin ToolRegistry"
  - "End-to-end wiring: user text -> LLM with tools -> search/calendar results"
affects: [07-library-management, 08-status-monitoring]

# Tech tracking
tech-stack:
  added: []
  patterns: ["System prompt structured sections: role, capabilities, search behavior, response format"]

key-files:
  created: []
  modified:
    - src/conversation/system-prompt.ts
    - src/plugins/conversation.ts

key-decisions:
  - "System prompt uses structured sections (search behavior, response format) rather than flat guidelines list"
  - "Tool registration logs tool count for debugging visibility"

patterns-established:
  - "System prompt section pattern: role intro, capabilities, behavior-specific guidance, response format"
  - "Tool registration pattern: import from barrel index, register each tool after createToolRegistry()"

# Metrics
duration: 1min
completed: 2026-02-14
---

# Phase 6 Plan 02: Tool Registration & System Prompt Summary

**System prompt with search ambiguity resolution and SMS formatting, plus all four search/discovery tools wired into the conversation plugin ToolRegistry**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-14T04:16:25Z
- **Completed:** 2026-02-14T04:17:43Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- System prompt now guides LLM on single-result auto-selection vs. numbered list for ambiguous results
- Library status mention instruction ensures users know if media is already in their library
- All four search/discovery tools registered alongside check_status (5 total tools in registry)
- End-to-end flow complete: user text -> webhook -> LLM with tool definitions -> search/calendar execution

## Task Commits

Each task was committed atomically:

1. **Task 1: Update system prompt with search behavior and ambiguity resolution guidance** - `2c8a312` (feat)
2. **Task 2: Register all search/discovery tools in the conversation plugin** - `1a15f28` (feat)

**Plan metadata:** `8ee0be3` (docs: complete plan)

## Files Created/Modified
- `src/conversation/system-prompt.ts` - Expanded SYSTEM_PROMPT with search behavior, ambiguity handling, and SMS-friendly response format sections
- `src/plugins/conversation.ts` - Import and register searchMoviesTool, searchSeriesTool, getUpcomingEpisodesTool, getUpcomingMoviesTool from barrel index

## Decisions Made
- System prompt uses structured sections (search behavior, response format) rather than a flat guidelines list -- clearer for LLM instruction following
- Tool registration logs the tool count on initialization for debugging visibility (was just model name before)

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None -- no external service configuration required.

## Next Phase Readiness
- Search and discovery phase fully complete -- all tools defined, registered, and system prompt guides LLM behavior
- Ready for Phase 7 (Library Management) which will add add/remove/manage tools following the same defineTool + register pattern
- ToolRegistry now holds 5 tools; Phase 7 will extend this with library management operations

## Self-Check: PASSED

- [x] src/conversation/system-prompt.ts exists
- [x] src/plugins/conversation.ts exists
- [x] Commit 2c8a312 exists (Task 1)
- [x] Commit 1a15f28 exists (Task 2)
- [x] `npx tsc --noEmit` passes
- [x] `npx biome check src/` passes
- [x] System prompt contains "ambiguous" and "numbered list"
- [x] conversation.ts imports from tools/index.js
- [x] conversation.ts has 4 registry.register() calls

---
*Phase: 06-search-and-discovery*
*Completed: 2026-02-14*

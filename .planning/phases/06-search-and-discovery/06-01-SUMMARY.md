---
phase: 06-search-and-discovery
plan: 01
subsystem: conversation
tags: [llm-tools, sonarr, radarr, search, calendar, zod, defineTool]

# Dependency graph
requires:
  - phase: 04-media-server-clients
    provides: "SonarrClient and RadarrClient with search, getSeries/getMovies, getCalendar, getUpcoming methods"
  - phase: 05-conversation-engine
    provides: "defineTool(), ToolDefinition interface, ToolContext with optional sonarr/radarr clients"
provides:
  - "search_movies tool definition wrapping Radarr search with library cross-reference"
  - "search_series tool definition wrapping Sonarr search with library cross-reference"
  - "get_upcoming_episodes tool definition wrapping Sonarr calendar with series title resolution"
  - "get_upcoming_movies tool definition wrapping Radarr upcoming with release dates"
  - "Barrel index re-exporting all four tools"
affects: [06-02-tool-registration, 07-library-management]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Tool definition pattern: null-check client, parallel fetch with Promise.all, build lookup Set/Map, cap and truncate results"]

key-files:
  created:
    - src/conversation/tools/search-movies.ts
    - src/conversation/tools/search-series.ts
    - src/conversation/tools/get-upcoming.ts
    - src/conversation/tools/index.ts
  modified: []

key-decisions:
  - "Used .optional() instead of .default() for days parameter to avoid JSON Schema ambiguity with LLM providers"
  - "Series title resolution via separate getSeries() Map lookup rather than relying on includeSeries passthrough"
  - "Overview truncation at 150 chars for search tools, 100 chars for upcoming movies"

patterns-established:
  - "Tool null-check pattern: if (!context.client) return { error: 'Server not configured' }"
  - "Library cross-reference pattern: parallel fetch search + library, build Set of IDs, boolean lookup"
  - "Calendar enrichment pattern: parallel fetch calendar + entity list, build Map for title resolution"

# Metrics
duration: 2min
completed: 2026-02-14
---

# Phase 6 Plan 01: Search & Discovery Tools Summary

**Four LLM tool definitions (search_movies, search_series, get_upcoming_episodes, get_upcoming_movies) wrapping Sonarr/Radarr client methods with library cross-reference and result capping**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-14T04:12:10Z
- **Completed:** 2026-02-14T04:14:07Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- search_movies and search_series tools cross-reference results against library via tmdbId/tvdbId Set lookup
- get_upcoming_episodes resolves series titles via separate getSeries() call with Map lookup
- get_upcoming_movies surfaces theatrical, digital, and physical release dates
- All four tools null-check their media server client and return structured errors when unconfigured
- Barrel index re-exports all tools for clean registration in Plan 02

## Task Commits

Each task was committed atomically:

1. **Task 1: Create search_movies and search_series tool definitions** - `9da997d` (feat)
2. **Task 2: Create get_upcoming_episodes and get_upcoming_movies tool definitions plus barrel index** - `b6ebbb6` (feat)

**Plan metadata:** `6228416` (docs: complete plan)

## Files Created/Modified
- `src/conversation/tools/search-movies.ts` - search_movies tool: Radarr search with tmdbId library cross-reference
- `src/conversation/tools/search-series.ts` - search_series tool: Sonarr search with tvdbId library cross-reference
- `src/conversation/tools/get-upcoming.ts` - get_upcoming_episodes (Sonarr calendar with title resolution) and get_upcoming_movies (Radarr upcoming with release dates)
- `src/conversation/tools/index.ts` - Barrel re-export of all four search/discovery tools

## Decisions Made
- Used `.optional()` instead of `.default()` for days parameters to avoid JSON Schema ambiguity with LLM providers; defaults applied in executor (`args.days ?? 7` / `args.days ?? 30`)
- Series title resolution uses separate `getSeries()` call in parallel rather than relying on `includeSeries` query param passthrough -- more reliable cross-reference
- Overview truncation: 150 chars for search tools, 100 chars for upcoming movies (shorter to keep calendar responses compact)

## Deviations from Plan

None -- plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None -- no external service configuration required.

## Next Phase Readiness
- All four tool definitions ready for registration in the conversation plugin (Plan 02)
- Tools follow the established `defineTool()` pattern and are type-safe against `ToolDefinition` interface
- Barrel index provides clean import path: `import { searchMoviesTool, ... } from "./tools/index.js"`

## Self-Check: PASSED

- [x] src/conversation/tools/search-movies.ts exists
- [x] src/conversation/tools/search-series.ts exists
- [x] src/conversation/tools/get-upcoming.ts exists
- [x] src/conversation/tools/index.ts exists
- [x] Commit 9da997d exists (Task 1)
- [x] Commit b6ebbb6 exists (Task 2)
- [x] `npx tsc --noEmit` passes
- [x] `npx biome check` passes

---
*Phase: 06-search-and-discovery*
*Completed: 2026-02-14*

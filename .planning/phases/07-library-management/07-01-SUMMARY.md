---
phase: 07-library-management
plan: 01
subsystem: conversation
tags: [tools, radarr, sonarr, library-management, defineTool, zod]

# Dependency graph
requires:
  - phase: 04-media-server-clients
    provides: "RadarrClient and SonarrClient with addMovie, addSeries, removeMovie, removeSeries, lookupByTmdbId, cached qualityProfiles/rootFolders"
  - phase: 05-conversation-engine
    provides: "defineTool pattern, ToolRegistry, ConfirmationTier (safe/destructive), ToolContext"
  - phase: 06-search-and-discovery
    provides: "searchMoviesTool and searchSeriesTool with inLibrary flag"
provides:
  - "add_movie tool definition with safe tier and sensible defaults"
  - "add_series tool definition with safe tier, tvdb: prefix lookup, and titleSlug/images/seasons passthrough"
  - "remove_movie tool definition with destructive tier for confirmation flow"
  - "remove_series tool definition with destructive tier for confirmation flow"
  - "libraryId field on search results enabling remove flow"
  - "Barrel index exporting all 8 conversation tools"
affects: [07-library-management, 08-status-and-queue]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Map-based library lookup for enriched search results", "Cached config defaults (qualityProfiles[0], rootFolders[0]) for zero-config add operations"]

key-files:
  created:
    - src/conversation/tools/add-movie.ts
    - src/conversation/tools/add-series.ts
    - src/conversation/tools/remove-movie.ts
    - src/conversation/tools/remove-series.ts
  modified:
    - src/conversation/tools/search-movies.ts
    - src/conversation/tools/search-series.ts
    - src/conversation/tools/index.ts

key-decisions:
  - "Add tools use safe tier (non-destructive), remove tools use destructive tier (triggers confirmation)"
  - "Sensible defaults from cached config: qualityProfiles[0] and rootFolders[0] so users never specify these"
  - "add_series passes titleSlug, images, seasons from lookup result (required by Sonarr API)"
  - "Search tools changed from Set to Map for library lookup to expose libraryId alongside inLibrary boolean"
  - "Sonarr uses addImportListExclusion (not addImportExclusion like Radarr) per API differences"

patterns-established:
  - "Map-based enrichment: Replace Set<id> with Map<id, entity> when search results need additional fields from library data"
  - "Zero-config add: Use cached server config for sensible defaults, validate presence, return clear error if missing"

# Metrics
duration: 2min
completed: 2026-02-14
---

# Phase 7 Plan 1: Library Management Tools Summary

**Add/remove movie and series tools with sensible defaults from cached config and destructive-tier confirmation for removals**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-14T04:41:40Z
- **Completed:** 2026-02-14T04:43:53Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Created add_movie tool that looks up by TMDB ID, applies quality/path defaults, and POSTs to Radarr with search-for-movie enabled
- Created add_series tool that looks up by TVDB ID prefix search, passes titleSlug/images/seasons, and POSTs to Sonarr with search-for-missing-episodes enabled
- Created remove_movie and remove_series tools with destructive tier to trigger confirmation system
- Extended search_movies and search_series to return libraryId for in-library items, enabling the remove flow

## Task Commits

Each task was committed atomically:

1. **Task 1: Create add_movie and add_series tool definitions** - `d139e52` (feat)
2. **Task 2: Create remove tools, extend search results with libraryId, update barrel index** - `a7c13a6` (feat)

## Files Created/Modified
- `src/conversation/tools/add-movie.ts` - add_movie tool: TMDB lookup, quality/path defaults, POST to Radarr
- `src/conversation/tools/add-series.ts` - add_series tool: TVDB prefix lookup, titleSlug/images/seasons passthrough, POST to Sonarr
- `src/conversation/tools/remove-movie.ts` - remove_movie tool: destructive tier, deleteFiles option, addImportExclusion
- `src/conversation/tools/remove-series.ts` - remove_series tool: destructive tier, deleteFiles option, addImportListExclusion
- `src/conversation/tools/search-movies.ts` - Added libraryId field via Map-based library lookup
- `src/conversation/tools/search-series.ts` - Added libraryId field via Map-based library lookup
- `src/conversation/tools/index.ts` - Barrel re-export of all 8 tools

## Decisions Made
- Add tools use "safe" tier (non-destructive); remove tools use "destructive" tier (triggers confirmation interception in toolCallLoop)
- Sensible defaults from cached config: first quality profile and first root folder, with clear error if either is missing
- add_series passes titleSlug, images, and seasons from the lookup result as required by Sonarr API
- Search tools changed from Set-based to Map-based library lookup to expose libraryId alongside inLibrary boolean
- Sonarr uses addImportListExclusion (not addImportExclusion like Radarr) per API differences
- Monitor mode set to "all" for add_series per research findings

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 8 conversation tools now available via barrel index (upcoming, search, add, remove)
- Ready for Plan 07-02 (tool registration into conversation plugin)
- Destructive tier tools will trigger confirmation flow already implemented in Phase 5

## Self-Check: PASSED

All 5 created files verified on disk. Both task commits (d139e52, a7c13a6) verified in git log.

---
*Phase: 07-library-management*
*Completed: 2026-02-14*

---
phase: 09-tmdb-discovery-library-routing
plan: 03
subsystem: api
tags: [routing, anime, sonarr, radarr, tdd, vitest, pure-functions]

# Dependency graph
requires:
  - phase: 05-conversation-engine
    provides: "defineTool pattern, ToolRegistry, ToolContext"
  - phase: 07-library-management
    provides: "add_series and add_movie tools with hardcoded defaults"
  - phase: 09-tmdb-discovery-library-routing
    provides: "TmdbClient.getMovieDetails() for ISO language codes"
provides:
  - "routeSeries pure function with anime detection (Japanese+Animation OR explicit Anime genre)"
  - "routeMovie pure function with Asian-language detection (11 ISO codes + full names)"
  - "findQualityProfile helper with case-insensitive hint matching"
  - "libraryOverride parameter on add_series (anime/tv) and add_movie (cmovies/movies)"
  - "Routing config env vars: SONARR_ANIME_ROOT_FOLDER_HINT, RADARR_CMOVIES_ROOT_FOLDER_HINT, DEFAULT_QUALITY_PROFILE_HINT"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure routing functions with RoutingDecision return type (testable, no side effects)"
    - "Two-signal anime detection: Japanese language + Animation genre OR explicit Anime genre"
    - "Dual-format language matching: ISO 639-1 codes and full English names for Asian languages"
    - "Routing hint env vars with sensible defaults (anime, cmovies, 1080)"

key-files:
  created:
    - "src/media/routing/library-router.ts"
    - "src/media/routing/library-router.types.ts"
    - "tests/routing.test.ts"
  modified:
    - "src/conversation/tools/add-series.ts"
    - "src/conversation/tools/add-movie.ts"
    - "src/media/radarr/radarr.schemas.ts"
    - "src/config.ts"
    - "src/conversation/types.ts"
    - "src/conversation/engine.ts"
    - "src/conversation/system-prompt.ts"

key-decisions:
  - "Pure functions for routing (no API calls, no side effects) -- maximizes testability"
  - "Dual language matching (ISO codes + full names) for Radarr/TMDB compatibility"
  - "TMDB ISO code preferred over Radarr language name when TMDB client available"
  - "Config added to ToolContext interface rather than importing loadConfig in tools"

patterns-established:
  - "RoutingDecision pattern: pure function returns path + quality + reason for LLM to relay"
  - "Library override pattern: Zod enum param on add tools bypasses auto-detection"

# Metrics
duration: 5min
completed: 2026-02-14
---

# Phase 9 Plan 03: Library Routing Summary

**TDD-built pure routing functions for anime series and Asian-language movie auto-detection with user override support on add tools**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-14T23:26:58Z
- **Completed:** 2026-02-14T23:32:03Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Pure routing functions (routeSeries, routeMovie, findQualityProfile) with 16 unit tests via TDD
- Anime auto-detection via two-signal rule (Japanese + Animation) or explicit Anime genre from TheTVDB
- Asian-language movie routing supporting 11 languages by ISO code and full English name
- libraryOverride parameter on both add_series and add_movie for user override
- 1080p quality profile selected by default via hint matching

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for routing** - `b691a08` (test)
2. **Task 1 (GREEN): Routing pure functions implementation** - `d4146dc` (feat)
3. **Task 2: Routing integration into add tools** - `66d4fb4` (feat)

_Note: TDD task has separate RED and GREEN commits._

## Files Created/Modified
- `src/media/routing/library-router.types.ts` - RoutingDecision, SeriesRoutingMetadata, MovieRoutingMetadata, RoutingConfig types
- `src/media/routing/library-router.ts` - routeSeries, routeMovie, findQualityProfile pure functions
- `tests/routing.test.ts` - 16 unit tests covering anime detection, Asian language routing, quality matching, fallbacks
- `src/conversation/tools/add-series.ts` - Integrated routeSeries, added libraryOverride param (anime/tv)
- `src/conversation/tools/add-movie.ts` - Integrated routeMovie, added libraryOverride param (cmovies/movies), TMDB language resolution
- `src/media/radarr/radarr.schemas.ts` - Added typed originalLanguage field to MovieLookupSchema
- `src/config.ts` - Added SONARR_ANIME_ROOT_FOLDER_HINT, RADARR_CMOVIES_ROOT_FOLDER_HINT, DEFAULT_QUALITY_PROFILE_HINT
- `src/conversation/types.ts` - Added config to ToolContext interface
- `src/conversation/engine.ts` - Wired config into ToolContext at both construction sites
- `src/conversation/system-prompt.ts` - Added library routing behavior guidance for LLM

## Decisions Made
- Pure functions for routing logic (no API calls, no dependencies) -- maximizes testability and makes TDD natural
- Dual-format language matching: ISO 639-1 codes AND full English names to handle both TMDB responses (ISO) and Radarr responses (names)
- TMDB ISO code preferred when TmdbClient is available; falls back to Radarr language name
- Config passed via ToolContext (Option A from plan) rather than importing loadConfig directly in tools

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict-mode array access**
- **Found during:** Task 1 (GREEN phase), Task 2
- **Issue:** `profiles[0]` and `rootFolders[0]` possibly undefined under strict null checks
- **Fix:** Added explicit null guards with throw for empty arrays in pure functions; extracted `defaultFolder` variable in add tools after length check
- **Files modified:** src/media/routing/library-router.ts, src/conversation/tools/add-series.ts, src/conversation/tools/add-movie.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** d4146dc, 66d4fb4

**2. [Rule 3 - Blocking] Fixed biome formatting violations**
- **Found during:** Task 2
- **Issue:** Biome formatter wanted different line wrapping for multi-property objects and `.find()` calls
- **Fix:** Ran `npx biome check --write` on affected files
- **Files modified:** src/conversation/engine.ts, src/conversation/tools/add-movie.ts, src/conversation/tools/add-series.ts, src/media/radarr/radarr.schemas.ts
- **Verification:** `npx biome check src/` passes with zero errors
- **Committed in:** 66d4fb4

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for TypeScript compilation and lint compliance. No scope creep.

## Issues Encountered
None

## User Setup Required
None - routing uses environment variables with sensible defaults (anime, cmovies, 1080). Users can override via:
- `SONARR_ANIME_ROOT_FOLDER_HINT` - Substring to match in Sonarr root folder paths for anime (default: "anime")
- `RADARR_CMOVIES_ROOT_FOLDER_HINT` - Substring to match in Radarr root folder paths for CMovies (default: "cmovies")
- `DEFAULT_QUALITY_PROFILE_HINT` - Substring to match in quality profile names (default: "1080")

## Next Phase Readiness
- Library routing is fully integrated into add_series and add_movie tools
- Phase 9 is complete: TMDB discovery + library routing all wired
- Ready for Phase 10 (Plex integration)

---
*Phase: 09-tmdb-discovery-library-routing*
*Completed: 2026-02-14*

## Self-Check: PASSED

All 10 files verified present. All 3 commits verified in git log.

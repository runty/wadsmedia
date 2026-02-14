---
phase: 09-tmdb-discovery-library-routing
plan: 01
subsystem: api
tags: [tmdb, discovery, zod, fetch, fastify-plugin]

# Dependency graph
requires:
  - phase: 05-conversation-engine
    provides: "defineTool pattern, ToolRegistry, ToolContext, tool-loop.ts"
  - phase: 04-media-server-clients
    provides: "SonarrClient/RadarrClient pattern, apiRequest helper, error classes"
provides:
  - "TmdbClient class with genre caching, person search, movie/TV discovery, and detail retrieval"
  - "discover_media LLM tool for structured media discovery by genre/actor/year/language"
  - "TMDB Fastify plugin with graceful degradation"
  - "ToolContext.tmdb wiring across engine and webhook handler"
affects: [09-tmdb-discovery-library-routing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TMDB-specific HTTP helper with Bearer auth (separate from Sonarr/Radarr X-Api-Key helper)"
    - "Genre name-to-ID resolution via cached lookup loaded at startup"
    - "Compound LLM tool pattern: single discover_media tool covering both movie and TV discovery"

key-files:
  created:
    - "src/media/tmdb/tmdb.http.ts"
    - "src/media/tmdb/tmdb.schemas.ts"
    - "src/media/tmdb/tmdb.types.ts"
    - "src/media/tmdb/tmdb.utils.ts"
    - "src/media/tmdb/tmdb.client.ts"
    - "src/conversation/tools/discover-media.ts"
    - "src/plugins/tmdb.ts"
  modified:
    - "src/conversation/system-prompt.ts"
    - "src/plugins/webhook.ts"
    - "src/server.ts"

key-decisions:
  - "TMDB HTTP helper is separate from existing apiRequest (different auth scheme: Bearer vs X-Api-Key)"
  - "Single discover_media tool with type discriminator instead of separate discover_movies + discover_tv tools (keeps tool count under 15)"
  - "Genre cache loaded once at startup via TmdbClient.loadGenres(), not on every request"
  - "Actor search failure returns error to LLM; genre search failure silently omits filter (better UX)"

patterns-established:
  - "TMDB Bearer token auth pattern: tmdbRequest helper in tmdb.http.ts"
  - "Paginated schema helper: PaginatedSchema<T> for TMDB response validation"
  - "Genre resolution: exact match then fuzzy includes match"

# Metrics
duration: 6min
completed: 2026-02-14
---

# Phase 9 Plan 01: TMDB Client and discover_media Tool Summary

**TmdbClient class with genre caching, person search, and movie/TV discovery powering a single discover_media LLM tool**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-14T23:17:43Z
- **Completed:** 2026-02-14T23:24:13Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- TmdbClient class with Bearer auth, genre caching, person search, movie/TV discovery, and detail retrieval
- discover_media LLM tool accepting genre, actor, year, language, keyword params with intelligent resolution
- TMDB Fastify plugin with graceful degradation when TMDB_ACCESS_TOKEN is not set
- System prompt updated with discovery behavior guidance for the LLM

## Task Commits

Each task was committed atomically:

1. **Task 1: TMDB client infrastructure** - `302224a` (feat)
2. **Task 2: discover_media tool, Fastify plugin, and wiring** - `839fee0` (feat)

## Files Created/Modified
- `src/media/tmdb/tmdb.http.ts` - TMDB-specific HTTP helper with Bearer auth and /3/ prefix
- `src/media/tmdb/tmdb.schemas.ts` - Zod schemas for genre lists, discover movies/TV, person search, movie/TV detail
- `src/media/tmdb/tmdb.types.ts` - TypeScript types inferred from schemas (GenreMap, DiscoverMovieResult, etc.)
- `src/media/tmdb/tmdb.utils.ts` - Image URL utility handling null paths and valid TMDB sizes
- `src/media/tmdb/tmdb.client.ts` - TmdbClient class with genre caching, person search, discovery, detail retrieval
- `src/conversation/tools/discover-media.ts` - discover_media LLM tool with structured discovery params
- `src/plugins/tmdb.ts` - Fastify plugin creating TmdbClient and loading genre cache at startup
- `src/conversation/system-prompt.ts` - Added discovery capability and behavior guidance
- `src/plugins/webhook.ts` - Added tmdb to ToolContext in webhook handler
- `src/server.ts` - Registered tmdb plugin in server startup

## Decisions Made
- TMDB HTTP helper is separate from existing apiRequest due to different auth scheme (Bearer vs X-Api-Key)
- Single discover_media tool covers both movie and TV discovery via `type` discriminator (keeps tool count under 15)
- Genre cache loaded once at startup, not per-request (TMDB genre IDs are stable)
- Actor search failure returns error to LLM; genre resolution failure silently omits filter for better UX

## Deviations from Plan

None - plan executed exactly as written. Several files referenced in the plan (config.ts, types.ts, engine.ts, conversation.ts, tools/index.ts) were already pre-wired by the 09-02 commit which had forward-looking TMDB integration alongside its Brave Search work.

## Issues Encountered
None

## User Setup Required

**External services require manual configuration.** The following environment variable must be set:

- `TMDB_ACCESS_TOKEN` - TMDB API v4 read access token
  - Get it from: https://www.themoviedb.org/settings/api -> "API Read Access Token (v4 auth)"
  - The app starts gracefully without this token (TMDB features unavailable)

## Next Phase Readiness
- TmdbClient is ready for use by Plan 09-03 (library routing) via `getMovieDetails()` and `getTvDetails()`
- discover_media tool is registered and callable by the conversation engine
- Total tool count is 12 (10 v1.0 + discover_media + web_search), well under the 15-tool limit

---
*Phase: 09-tmdb-discovery-library-routing*
*Completed: 2026-02-14*

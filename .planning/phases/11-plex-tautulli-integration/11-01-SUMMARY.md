---
phase: 11-plex-tautulli-integration
plan: 01
subsystem: api
tags: [plex, fastify-plugin, zod, library-cache, llm-tool]

# Dependency graph
requires:
  - phase: 04-media-server-clients
    provides: "Error classes (MediaServerError, ConnectionError, ValidationError), apiRequest pattern"
  - phase: 05-conversation-engine
    provides: "defineTool, ToolRegistry, ToolContext, processConversation, system-prompt"
  - phase: 09-tmdb-discovery-library-routing
    provides: "TMDB HTTP helper pattern, TmdbClient pattern, tmdb plugin pattern"
provides:
  - "PlexClient with GUID-indexed in-memory library cache (O(1) lookup by TMDB/TVDB ID)"
  - "plexRequest HTTP helper with X-Plex-Token auth, JSON Accept, client ID headers"
  - "check_plex_library LLM tool for library existence checks and season availability"
  - "Fastify plex plugin with async cache loading, periodic refresh, health monitoring"
  - "PLEX_URL, PLEX_TOKEN, TAUTULLI_URL, TAUTULLI_API_KEY in config.ts"
  - "plex and tautulli fields in ToolContext interface"
affects: [11-02-tautulli-watch-history]

# Tech tracking
tech-stack:
  added: []
  patterns: ["GUID-indexed library cache with atomic swap", "async cache loading (non-blocking startup)", "periodic cache refresh with interval cleanup on close"]

key-files:
  created:
    - src/media/plex/plex.http.ts
    - src/media/plex/plex.schemas.ts
    - src/media/plex/plex.types.ts
    - src/media/plex/plex.client.ts
    - src/plugins/plex.ts
    - src/conversation/tools/check-plex-library.ts
  modified:
    - src/config.ts
    - src/conversation/types.ts
    - src/conversation/engine.ts
    - src/plugins/webhook.ts
    - src/plugins/conversation.ts
    - src/conversation/tools/index.ts
    - src/server.ts
    - src/conversation/system-prompt.ts

key-decisions:
  - "GUID regex parsing for provider-agnostic cache keys (tmdb:ID, tvdb:ID, imdb:ID)"
  - "Async cache load on startup (non-blocking) with 15min refresh interval"
  - "Tautulli config vars and ToolContext field added in this plan to avoid config.ts churn in 11-02"
  - "tautulli typed as unknown in ToolContext (Plan 11-02 will replace with proper import)"

patterns-established:
  - "Plex HTTP helper: X-Plex-Token header auth (distinct from TMDB Bearer and Sonarr/Radarr X-Api-Key patterns)"
  - "Library cache with atomic swap: build new Map, then assign reference (no partial state)"
  - "Graceful degradation: app starts without PLEX_URL/PLEX_TOKEN, features unavailable but not broken"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 11 Plan 01: Plex Library Client Summary

**PlexClient with GUID-indexed library cache, check_plex_library LLM tool, and Fastify plugin with async loading and health monitoring**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T00:23:10Z
- **Completed:** 2026-02-15T00:26:32Z
- **Tasks:** 2
- **Files modified:** 14 (6 created, 8 modified)

## Accomplishments
- PlexClient class with in-memory GUID-indexed library cache providing O(1) lookup by TMDB or TVDB ID
- check_plex_library LLM tool (tool #13) with ID-based lookup, season/episode availability for TV shows, and graceful fallbacks
- Fastify plex plugin with connectivity health check, async cache loading (non-blocking startup), 15min periodic cache refresh, 30min health monitoring, and interval cleanup on close
- Full server wiring: config env vars, ToolContext, engine params, webhook passthrough, plugin registration, system prompt guidance for Plex library awareness

## Task Commits

Each task was committed atomically:

1. **Task 1: Plex HTTP helper, Zod schemas, types, and PlexClient class** - `2ba0510` (feat)
2. **Task 2: Plex Fastify plugin, check_plex_library tool, and full server wiring** - `d7cd466` (feat)

## Files Created/Modified
- `src/media/plex/plex.http.ts` - Plex HTTP helper with X-Plex-Token auth, JSON Accept, client ID headers
- `src/media/plex/plex.schemas.ts` - Zod schemas for sections, library items, GUIDs, children/seasons
- `src/media/plex/plex.types.ts` - PlexLibraryItem, SeasonAvailability, PlexLibrarySection types
- `src/media/plex/plex.client.ts` - PlexClient with cache, findByTmdbId/TvdbId, getShowAvailability, healthCheck
- `src/plugins/plex.ts` - Fastify plugin with async cache, periodic refresh, health monitoring
- `src/conversation/tools/check-plex-library.ts` - check_plex_library LLM tool
- `src/config.ts` - Added PLEX_URL, PLEX_TOKEN, TAUTULLI_URL, TAUTULLI_API_KEY
- `src/conversation/types.ts` - Added plex and tautulli to ToolContext
- `src/conversation/engine.ts` - Added PlexClient to params and both context objects
- `src/plugins/webhook.ts` - Added plex passthrough to processConversation call
- `src/plugins/conversation.ts` - Imported and registered checkPlexLibraryTool
- `src/conversation/tools/index.ts` - Added checkPlexLibraryTool export
- `src/server.ts` - Imported and registered plexPlugin
- `src/conversation/system-prompt.ts` - Added Plex library guidance section

## Decisions Made
- GUID regex parsing (`/^(\w+):\/\/(.+)$/`) for provider-agnostic cache indexing -- supports tmdb, tvdb, imdb, and any future GUID providers
- Async cache loading on startup: `loadLibraryCache()` runs without awaiting so the server starts immediately. Large Plex libraries (10k+ items) can take seconds to fetch.
- Added TAUTULLI_URL, TAUTULLI_API_KEY to config.ts and tautulli to ToolContext in this plan to prevent config.ts churn when Plan 11-02 executes
- Used `tautulli?: unknown` in ToolContext since the TautulliClient module doesn't exist yet; Plan 11-02 will replace with the proper import type
- Health check timeout set to 5s (faster than regular requests) to avoid blocking startup on slow/unreachable Plex servers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration.** The following environment variables must be set:

- `PLEX_URL` - Plex server URL (e.g., `http://192.168.1.100:32400`)
- `PLEX_TOKEN` - Plex authentication token from Preferences.xml on the Plex server, or from plex.tv/devices.xml when logged in

**Verification:** After setting env vars, start the server and check logs for "Plex client configured, library cache loading..." followed by "Plex library cache loaded" with a cacheSize > 0.

## Next Phase Readiness
- PlexClient and check_plex_library tool are fully wired and ready for use
- ToolContext has tautulli field ready for Plan 11-02 (Tautulli watch history integration)
- Config has TAUTULLI_URL and TAUTULLI_API_KEY ready for Plan 11-02

## Self-Check: PASSED

All 6 created files verified on disk. Both task commits (2ba0510, d7cd466) verified in git log.

---
*Phase: 11-plex-tautulli-integration*
*Completed: 2026-02-15*

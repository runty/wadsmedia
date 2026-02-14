---
phase: 04-media-server-clients
plan: 02
subsystem: api
tags: [radarr, zod, fetch, http-client, media-server, tmdb]

# Dependency graph
requires:
  - phase: 04-media-server-clients
    plan: 01
    provides: "Shared apiRequest/apiRequestVoid HTTP utility and error classes"
  - phase: 01-foundation
    provides: "Zod 4.3, TypeScript config, ESM project structure"
provides:
  - "RadarrClient class with 9 API methods (search, tmdb-lookup, get, add, remove, upcoming, queue, profiles, folders)"
  - "Zod schemas for all Radarr API response shapes with .passthrough()"
  - "TypeScript types inferred from schemas plus AddMovieInput interface"
affects: [04-03-fastify-plugins, 05-conversation-engine]

# Tech tracking
tech-stack:
  added: []
  patterns: ["RadarrClient mirrors SonarrClient pattern with Radarr-specific endpoints and schemas"]

key-files:
  created:
    - src/media/radarr/radarr.schemas.ts
    - src/media/radarr/radarr.types.ts
    - src/media/radarr/radarr.client.ts
  modified: []

key-decisions:
  - "MovieLookupSchema reused for Movie alias (identical shape, id non-zero after POST) -- same pattern as Sonarr"
  - "30s timeout for searchMovies and lookupByTmdbId (proxies to TMDB), 10s default for CRUD"
  - "QueueRecordSchema uses movieId instead of Sonarr's seriesId/episodeId"
  - "addImportExclusion param (not addImportListExclusion like Sonarr) per Radarr API"

patterns-established:
  - "Radarr client follows identical structure to Sonarr client: constructor DI, private request/requestVoid, public typed methods"
  - "Radarr-specific differences isolated to schemas and method signatures, shared HTTP layer untouched"

# Metrics
duration: 1min
completed: 2026-02-14
---

# Phase 4 Plan 2: Radarr Client Summary

**Typed Radarr API client with Zod-validated responses, 9 public methods covering search, TMDB lookup, library management, calendar, queue, and config fetching -- reusing shared HTTP utility from Plan 01**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-14T03:08:19Z
- **Completed:** 2026-02-14T03:09:38Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- Complete Radarr client with searchMovies, lookupByTmdbId, getMovies, addMovie, removeMovie, getUpcoming, getQueue, getQualityProfiles, getRootFolders
- All Zod schemas use .passthrough() for forward compatibility with Radarr API updates
- Radarr-specific API differences correctly handled: tmdbId (not tvdbId), movieId in queue, minimumAvailability in AddMovieInput, addImportExclusion (not addImportListExclusion) in removeMovie
- AddMovieInput interface includes required minimumAvailability field with union type for announced/inCinemas/released

## Task Commits

Each task was committed atomically:

1. **Task 1: Radarr Zod schemas and types** - `ee8e414` (feat)
2. **Task 2: RadarrClient class with all API methods** - `138e939` (feat)

## Files Created/Modified
- `src/media/radarr/radarr.schemas.ts` - Zod schemas for all Radarr API response shapes (6 schemas: Image, MovieLookup, QualityProfile, RootFolder, QueueRecord, QueuePage)
- `src/media/radarr/radarr.types.ts` - TypeScript types inferred from schemas plus AddMovieInput interface with minimumAvailability
- `src/media/radarr/radarr.client.ts` - RadarrClient class with 9 public API methods

## Decisions Made
- **MovieLookupSchema = Movie alias:** Same pattern as Sonarr's SeriesSchema/SeriesLookupSchema -- identical shape, id becomes non-zero after POST. Avoids maintaining duplicate schemas.
- **30s timeout for search/lookup:** searchMovies and lookupByTmdbId proxy through TMDB which can be slow. All CRUD operations use 10s default.
- **movieId in QueueRecordSchema:** Radarr queue records reference movieId instead of Sonarr's seriesId/episodeId -- correctly modeled in schema.
- **addImportExclusion (not addImportListExclusion):** Radarr uses a different parameter name than Sonarr for the delete exclusion option.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- RadarrClient ready for Fastify plugin wrapping in plan 04-03
- Both SonarrClient and RadarrClient share identical patterns, making plugin integration straightforward
- Error classes (ConnectionError, MediaServerError, ValidationError) shared across both clients

## Self-Check: PASSED

All 3 created files verified on disk. Both task commits (ee8e414, 138e939) verified in git log.

---
*Phase: 04-media-server-clients*
*Completed: 2026-02-14*

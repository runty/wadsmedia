---
phase: 04-media-server-clients
plan: 01
subsystem: api
tags: [sonarr, zod, fetch, http-client, media-server]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Zod 4.3, TypeScript config, ESM project structure"
provides:
  - "MediaServerError, ConnectionError, ValidationError error classes"
  - "Shared apiRequest/apiRequestVoid HTTP utility with auth injection, timeout, Zod validation"
  - "SonarrClient class with 8 API methods (search, get, add, remove, calendar, queue, profiles, folders)"
  - "Zod schemas for all Sonarr API response shapes with .passthrough()"
  - "TypeScript types inferred from schemas plus AddSeriesInput interface"
affects: [04-02-radarr-client, 04-03-fastify-plugins, 05-conversation-engine]

# Tech tracking
tech-stack:
  added: []
  patterns: ["apiRequest wrapper with Zod validation and error classification", "Client class with constructor DI for baseUrl/apiKey", ".passthrough() on all response schemas for API forward-compat"]

key-files:
  created:
    - src/media/errors.ts
    - src/media/http.ts
    - src/media/sonarr/sonarr.schemas.ts
    - src/media/sonarr/sonarr.types.ts
    - src/media/sonarr/sonarr.client.ts
  modified: []

key-decisions:
  - "SeriesSchema aliased to SeriesLookupSchema (identical shape, id becomes non-zero after POST)"
  - "30s timeout for search operations (proxies to TheTVDB), 10s default for CRUD"
  - "apiRequestVoid separated from apiRequest to avoid schema param on DELETE operations"

patterns-established:
  - "apiRequest<T>(options, schema) pattern for all media server API calls"
  - "Error classification: ConnectionError (unreachable/timeout), MediaServerError (non-2xx), ValidationError (schema mismatch)"
  - "Client class constructor takes (baseUrl, apiKey), private request() method bakes them in"
  - "All Zod response schemas use .passthrough() to tolerate unknown fields from API updates"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 4 Plan 1: Sonarr Client Summary

**Typed Sonarr API client with Zod-validated responses, shared HTTP utility with auth/timeout/error classification, and 8 API methods covering search, library management, calendar, and queue**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T03:02:42Z
- **Completed:** 2026-02-14T03:05:37Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments
- Shared HTTP foundation (apiRequest/apiRequestVoid) with API key injection, configurable timeout, Zod response validation, and three-class error hierarchy
- Complete Sonarr client with searchSeries, getSeries, addSeries, removeSeries, getCalendar, getQueue, getQualityProfiles, getRootFolders
- All Zod schemas use .passthrough() for forward compatibility with Sonarr API updates
- AddSeriesInput interface with all required fields (title, tvdbId, qualityProfileId, rootFolderPath, titleSlug, images, seasons, monitored) and optional fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared HTTP utility and error classes** - `2b9c1c7` (feat)
2. **Task 2: Sonarr Zod schemas, types, and client class** - `25098a0` (feat)

## Files Created/Modified
- `src/media/errors.ts` - MediaServerError, ConnectionError, ValidationError error classes
- `src/media/http.ts` - apiRequest with Zod validation and apiRequestVoid for DELETE operations
- `src/media/sonarr/sonarr.schemas.ts` - Zod schemas for all Sonarr API response shapes (9 schemas)
- `src/media/sonarr/sonarr.types.ts` - TypeScript types inferred from schemas plus AddSeriesInput interface
- `src/media/sonarr/sonarr.client.ts` - SonarrClient class with 8 public API methods

## Decisions Made
- **SeriesSchema = SeriesLookupSchema alias:** Both share identical shapes; after POST the `id` field becomes non-zero but the schema is the same. Separate schemas would add maintenance burden with no benefit since .passthrough() handles any extras.
- **30s search timeout:** Search operations proxy through TheTVDB which can be slow, especially on first request. CRUD operations use the default 10s.
- **Separate apiRequestVoid:** DELETE operations return empty bodies; forcing a schema parameter would be awkward. The void variant handles auth, timeout, and error checking without body parsing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Biome formatting fixes applied to all files**
- **Found during:** Task 2 verification
- **Issue:** Biome formatter required different line wrapping for imports, function signatures, and conditional expressions
- **Fix:** Ran `npx biome check --fix src/media/` to auto-format all files
- **Files modified:** src/media/errors.ts, src/media/http.ts, src/media/sonarr/sonarr.client.ts
- **Verification:** `npx biome check src/media/` passes with zero errors
- **Committed in:** 25098a0 (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Formatting-only changes. No logic or scope impact.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Shared HTTP utility (errors.ts, http.ts) ready for Radarr client to reuse in plan 04-02
- SonarrClient ready for Fastify plugin wrapping in plan 04-03
- Error classes ready for conversation engine error handling in Phase 5

## Self-Check: PASSED

All 5 created files verified on disk. Both task commits (2b9c1c7, 25098a0) verified in git log.

---
*Phase: 04-media-server-clients*
*Completed: 2026-02-14*

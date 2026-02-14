---
phase: 04-media-server-clients
verified: 2026-02-13T00:00:00Z
status: passed
score: 8/8 truths verified
re_verification: false
---

# Phase 4: Media Server Clients Verification Report

**Phase Goal:** The application can communicate with Sonarr and Radarr APIs to search, add, remove, and query media with validated, typed responses

**Verified:** 2026-02-13T00:00:00Z
**Status:** PASSED
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SonarrClient can search for series by term and return Zod-validated results | ✓ VERIFIED | `searchSeries()` method exists, uses `z.array(SeriesLookupSchema)` validation, 30s timeout for TheTVDB proxy |
| 2 | SonarrClient can add a series with quality profile, root folder, and monitoring options | ✓ VERIFIED | `addSeries(input: AddSeriesInput)` method exists with required fields (title, tvdbId, qualityProfileId, rootFolderPath, titleSlug, images, seasons, monitored) |
| 3 | SonarrClient can remove a series by ID with optional file deletion | ✓ VERIFIED | `removeSeries(id, opts)` method exists, uses DELETE with query params for deleteFiles and addImportListExclusion |
| 4 | SonarrClient can fetch calendar episodes for a date range | ✓ VERIFIED | `getCalendar(start, end)` method exists, validates with `z.array(EpisodeSchema)` |
| 5 | SonarrClient can fetch the download queue with pagination | ✓ VERIFIED | `getQueue(opts)` method exists with page/pageSize params, validates with `QueuePageSchema` |
| 6 | SonarrClient can fetch quality profiles and root folders for caching | ✓ VERIFIED | `getQualityProfiles()` and `getRootFolders()` methods exist, used by `loadCachedData()` |
| 7 | RadarrClient can search for movies by term and return Zod-validated results | ✓ VERIFIED | `searchMovies()` method exists, uses `z.array(MovieLookupSchema)` validation, 30s timeout |
| 8 | RadarrClient can look up a movie by TMDB ID | ✓ VERIFIED | `lookupByTmdbId(tmdbId)` method exists, validates with `MovieLookupSchema` (single object) |
| 9 | RadarrClient can add a movie with quality profile, root folder, minimum availability, and monitoring options | ✓ VERIFIED | `addMovie(input: AddMovieInput)` method exists with required Radarr-specific fields including `minimumAvailability` |
| 10 | RadarrClient can remove a movie by ID with optional file deletion | ✓ VERIFIED | `removeMovie(id, opts)` method exists, uses `addImportExclusion` (not addImportListExclusion) per Radarr API |
| 11 | RadarrClient can fetch upcoming movies for a date range | ✓ VERIFIED | `getUpcoming(start, end)` method exists, validates with `z.array(MovieLookupSchema)` |
| 12 | RadarrClient can fetch the download queue with pagination | ✓ VERIFIED | `getQueue(opts)` method exists, QueueRecordSchema uses `movieId` (not seriesId/episodeId) |
| 13 | RadarrClient can fetch quality profiles and root folders for caching | ✓ VERIFIED | `getQualityProfiles()` and `getRootFolders()` methods exist, used by `loadCachedData()` |
| 14 | Connection errors produce user-friendly ConnectionError, not raw fetch failures | ✓ VERIFIED | http.ts catches TypeError (unreachable) and DOMException TimeoutError, throws ConnectionError with hostname and user-friendly message |
| 15 | Unexpected API response shapes produce ValidationError, not crashes | ✓ VERIFIED | http.ts uses `schema.safeParse()`, throws ValidationError with path and zodError on failure |
| 16 | Quality profiles and root folders are fetched from Sonarr on startup and accessible via fastify.sonarr | ✓ VERIFIED | sonarr.ts plugin calls `loadCachedData()`, populates `qualityProfiles` and `rootFolders` properties, decorates `fastify.sonarr` |
| 17 | Quality profiles and root folders are fetched from Radarr on startup and accessible via fastify.radarr | ✓ VERIFIED | radarr.ts plugin calls `loadCachedData()`, populates `qualityProfiles` and `rootFolders` properties, decorates `fastify.radarr` |
| 18 | When Sonarr URL/key are not configured, the plugin skips registration gracefully with a warning log | ✓ VERIFIED | sonarr.ts checks `if (!SONARR_URL \|\| !SONARR_API_KEY)` and returns early with warn log |
| 19 | When Radarr URL/key are not configured, the plugin skips registration gracefully with a warning log | ✓ VERIFIED | radarr.ts checks `if (!RADARR_URL \|\| !RADARR_API_KEY)` and returns early with warn log |
| 20 | When Sonarr is unreachable on startup, the client is still registered but cached data is empty | ✓ VERIFIED | sonarr.ts wraps `loadCachedData()` in try/catch, logs error, still decorates fastify with client (empty arrays remain from initialization) |
| 21 | When Radarr is unreachable on startup, the client is still registered but cached data is empty | ✓ VERIFIED | radarr.ts wraps `loadCachedData()` in try/catch, logs error, still decorates fastify with client |
| 22 | The application starts successfully even when both Sonarr and Radarr are completely unavailable | ✓ VERIFIED | Both plugins use optional decorator type (`sonarr?: SonarrClient`), early return when not configured, no throw on connection error |
| 23 | Cached quality profiles and root folders are accessible as properties on the client instances | ✓ VERIFIED | Both clients have public `qualityProfiles: QualityProfile[] = []` and `rootFolders: RootFolder[] = []` properties populated by `loadCachedData()` |

**Score:** 23/23 truths verified (100%)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/media/errors.ts` | MediaServerError, ConnectionError, ValidationError error classes | ✓ VERIFIED | 41 lines, exports all 3 error classes with proper inheritance and properties |
| `src/media/http.ts` | Shared apiRequest/apiRequestVoid HTTP utility with auth, timeout, Zod validation | ✓ VERIFIED | 116 lines, exports both functions, implements auth headers, timeout, error classification, Zod safeParse |
| `src/media/sonarr/sonarr.schemas.ts` | Zod schemas for all Sonarr API response shapes | ✓ VERIFIED | 102 lines, exports 9 schemas (Image, Season, SeriesLookup, Series, QualityProfile, RootFolder, Episode, QueueRecord, QueuePage), all use `.passthrough()` |
| `src/media/sonarr/sonarr.types.ts` | TypeScript types inferred from Zod schemas | ✓ VERIFIED | 50 lines, exports inferred types plus AddSeriesInput interface |
| `src/media/sonarr/sonarr.client.ts` | SonarrClient class with all API methods | ✓ VERIFIED | 140 lines, exports SonarrClient with 8 public methods + loadCachedData + cached properties |
| `src/media/radarr/radarr.schemas.ts` | Zod schemas for all Radarr API response shapes | ✓ VERIFIED | 78 lines, exports 6 schemas (Image, MovieLookup, QualityProfile, RootFolder, QueueRecord, QueuePage), all use `.passthrough()` |
| `src/media/radarr/radarr.types.ts` | TypeScript types inferred from Zod schemas | ✓ VERIFIED | 38 lines, exports inferred types plus AddMovieInput interface with minimumAvailability |
| `src/media/radarr/radarr.client.ts` | RadarrClient class with all API methods | ✓ VERIFIED | 147 lines, exports RadarrClient with 9 public methods + loadCachedData + cached properties |
| `src/plugins/sonarr.ts` | Fastify plugin for SonarrClient with caching and graceful degradation | ✓ VERIFIED | 41 lines, creates client, loads cache, decorates fastify.sonarr, skip when unconfigured, degrade when unreachable |
| `src/plugins/radarr.ts` | Fastify plugin for RadarrClient with caching and graceful degradation | ✓ VERIFIED | 41 lines, creates client, loads cache, decorates fastify.radarr, skip when unconfigured, degrade when unreachable |
| `src/server.ts` | Updated server with sonarr and radarr plugin registration | ✓ VERIFIED | Imports both plugins, registers after database/health, before messaging |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| src/media/sonarr/sonarr.client.ts | src/media/http.ts | import apiRequest | ✓ WIRED | Line 3: `import { apiRequest, apiRequestVoid } from "../http.js"` |
| src/media/sonarr/sonarr.client.ts | src/media/sonarr/sonarr.schemas.ts | passes schemas to apiRequest for validation | ✓ WIRED | Schemas passed via private `request()` method wrapper (e.g., line 75: `z.array(SeriesLookupSchema)`) |
| src/media/http.ts | src/media/errors.ts | throws ConnectionError on fetch failure, ValidationError on parse failure | ✓ WIRED | Line 46-52: throws ConnectionError, line 57: throws MediaServerError, line 67: throws ValidationError |
| src/media/radarr/radarr.client.ts | src/media/http.ts | import apiRequest | ✓ WIRED | Line 3: `import { apiRequest, apiRequestVoid } from "../http.js"` |
| src/media/radarr/radarr.client.ts | src/media/radarr/radarr.schemas.ts | passes schemas to apiRequest for validation | ✓ WIRED | Schemas passed via private `request()` method wrapper |
| src/media/radarr/radarr.client.ts | src/media/errors.ts | uses shared error classes | ✓ WIRED | Imports from http.ts which imports and throws error classes |
| src/plugins/sonarr.ts | src/media/sonarr/sonarr.client.ts | creates SonarrClient instance and calls loadCachedData | ✓ WIRED | Line 20: `new SonarrClient(SONARR_URL, SONARR_API_KEY)`, line 23: `await client.loadCachedData()` |
| src/plugins/radarr.ts | src/media/radarr/radarr.client.ts | creates RadarrClient instance and calls loadCachedData | ✓ WIRED | Line 20: `new RadarrClient(RADARR_URL, RADARR_API_KEY)`, line 23: `await client.loadCachedData()` |
| src/server.ts | src/plugins/sonarr.ts | registers sonarr plugin | ✓ WIRED | Line 8: import sonarrPlugin, line 39: `await fastify.register(sonarrPlugin)` |
| src/server.ts | src/plugins/radarr.ts | registers radarr plugin | ✓ WIRED | Line 7: import radarrPlugin, line 40: `await fastify.register(radarrPlugin)` |

### Requirements Coverage

| Requirement | Status | Supporting Evidence |
|-------------|--------|---------------------|
| API-01: Sonarr API client with typed HTTP wrapper and Zod validation | ✓ SATISFIED | SonarrClient exists with 8 API methods, uses apiRequest wrapper, all responses Zod-validated |
| API-02: Radarr API client with typed HTTP wrapper and Zod validation | ✓ SATISFIED | RadarrClient exists with 9 API methods, uses same apiRequest wrapper, all responses Zod-validated |
| API-03: Quality profiles and root folders fetched dynamically on startup | ✓ SATISFIED | Both plugins call loadCachedData() on startup, cache stored in client.qualityProfiles and client.rootFolders |
| API-04: Graceful handling when Sonarr or Radarr is unreachable | ✓ SATISFIED | Plugins skip when unconfigured (early return), catch connection errors (log error, still register client), app starts successfully |

### Anti-Patterns Found

None.

**Scan results:**
- No TODO/FIXME/PLACEHOLDER comments found
- No stub patterns found (return null, return {}, console.log only)
- No console.log found
- All Zod schemas use `.passthrough()` for forward compatibility (10 in Sonarr, 7 in Radarr)
- Error handling is substantive with proper error classification and user-friendly messages
- All TypeScript compilation passes (`npx tsc --noEmit`)
- All code style checks pass (`npx biome check`)

### Build Verification

- ✓ `npx tsc --noEmit` passes with zero errors
- ✓ `npx biome check src/media/ src/plugins/sonarr.ts src/plugins/radarr.ts` passes with zero errors
- ✓ All 6 task commits verified in git log (2b9c1c7, 25098a0, ee8e414, 138e939, 971189c, 4f2cb6f)

### Implementation Quality

**Plan 04-01 (Sonarr Client):**
- HTTP foundation is robust with proper timeout handling (AbortSignal.timeout), auth injection, three-class error hierarchy
- Search operations use 30s timeout (TheTVDB proxy can be slow), CRUD uses 10s default
- SeriesSchema correctly aliased to SeriesLookupSchema (same shape, id becomes non-zero after POST)
- AddSeriesInput includes all required fields from Sonarr API (title, tvdbId, qualityProfileId, rootFolderPath, titleSlug, images, seasons, monitored)
- removeSeries properly handles optional deleteFiles and addImportListExclusion query params

**Plan 04-02 (Radarr Client):**
- RadarrClient mirrors SonarrClient structure but correctly handles Radarr-specific differences
- TMDB lookup uses 30s timeout (TMDB proxy can be slow)
- MovieLookupSchema correctly aliased to Movie (same pattern as Sonarr)
- AddMovieInput includes Radarr-specific `minimumAvailability` field with proper union type ("announced" | "inCinemas" | "released")
- removeMovie correctly uses `addImportExclusion` (not addImportListExclusion like Sonarr)
- QueueRecordSchema correctly uses `movieId` instead of Sonarr's seriesId/episodeId
- getUpcoming returns movies (not episodes like Sonarr's getCalendar)

**Plan 04-03 (Fastify Plugins):**
- Both plugins use optional decorator type (`sonarr?: SonarrClient`) because registration may be skipped when not configured
- Three-tier resilience: skip if unconfigured (warn log), degrade if unreachable (error log + empty cache), full cache if healthy (info log)
- loadCachedData() uses Promise.all for parallel fetching of profiles and folders
- Plugins depend on database plugin for consistent infrastructure ordering (even though no direct DB use)
- Server registration order is correct: database → health → sonarr → radarr → messaging → user-resolver → webhook

---

## Summary

**Phase 4 goal achieved.** All 23 observable truths verified. All 11 required artifacts exist and are substantive (not stubs). All 10 key links are properly wired. All 4 requirements satisfied.

The application can now:
- Search for series/movies and get Zod-validated results
- Add series/movies with quality profiles, root folders, and monitoring options
- Remove series/movies with optional file deletion
- Fetch calendar episodes (Sonarr) and upcoming movies (Radarr)
- Query download queues with pagination
- Access quality profiles and root folders via cached properties on client instances
- Start successfully even when Sonarr/Radarr are unconfigured or unreachable

Error handling is robust:
- ConnectionError for unreachable servers or timeouts (user-friendly hostname-based messages)
- MediaServerError for non-2xx API responses (includes status code and response body)
- ValidationError for unexpected response shapes (includes endpoint path and Zod error details)

Technical quality:
- All Zod schemas use `.passthrough()` for forward compatibility with API updates
- Shared HTTP utility eliminates code duplication between Sonarr and Radarr clients
- Radarr-specific differences properly isolated (tmdbId vs tvdbId, minimumAvailability, addImportExclusion, movieId in queue)
- Fastify plugins use optional decorators and graceful degradation patterns
- Full TypeScript type safety with inferred types from Zod schemas
- Zero build errors, zero style violations, zero anti-patterns

**Ready for Phase 5** (Conversation Engine) which will use these clients via `fastify.sonarr` and `fastify.radarr` decorators.

---

_Verified: 2026-02-13T00:00:00Z_
_Verifier: Claude (gsd-verifier)_

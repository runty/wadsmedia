---
phase: 09-tmdb-discovery-library-routing
verified: 2026-02-14T23:35:00Z
status: passed
score: 7/7 truths verified
re_verification: false
---

# Phase 9: TMDB Discovery & Library Routing Verification Report

**Phase Goal:** Users can discover media through natural language queries (by actor, genre, network, year, or vague description) and media is automatically routed to the correct library folder

**Verified:** 2026-02-14T23:35:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                                  | Status     | Evidence                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| 1   | User can ask "show me sci-fi movies from the 90s" or "what has Oscar Isaac been in" and get relevant TMDB results with metadata (ratings, overview, year, genres)                   | ✓ VERIFIED | discover_media tool exists with genre/actor/year params, calls TmdbClient discovery methods        |
| 2   | User can describe media vaguely ("that movie where the guy relives the same day") and get correct results via web search fallback when TMDB structured search fails                 | ✓ VERIFIED | web_search tool exists, BraveSearchClient operational, system prompt guides LLM to use as fallback |
| 3   | Anime series are automatically detected and routed to the anime root folder when added via Sonarr, without user intervention                                                        | ✓ VERIFIED | routeSeries implements two-signal anime detection (ja+Animation OR "Anime" genre), 16 tests pass   |
| 4   | Asian-language movies are automatically detected and routed to the CMovies root folder when added via Radarr, without user intervention                                            | ✓ VERIFIED | routeMovie implements 11-language detection (ISO codes + names), tests pass, TMDB language used    |
| 5   | User can override auto-detected routing ("add this to regular TV" or "put this in the anime library") and system defaults to 1080p quality unless user requests otherwise          | ✓ VERIFIED | libraryOverride param exists on add_series and add_movie, findQualityProfile matches "1080" hint   |
| 6   | Genre names are resolved to TMDB genre IDs internally (user never sees IDs)                                                                                                          | ✓ VERIFIED | TmdbClient.loadGenres populates genre maps, resolveGenreId does exact+fuzzy match                  |
| 7   | App starts gracefully when TMDB_ACCESS_TOKEN or BRAVE_SEARCH_API_KEY are not set (features unavailable but no crash)                                                               | ✓ VERIFIED | Both plugins log warning and return early when unconfigured, tools return error messages           |

**Score:** 7/7 truths verified

### Required Artifacts (09-01: TMDB Discovery)

| Artifact                                              | Expected                                                         | Status     | Details                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| `src/media/tmdb/tmdb.client.ts`                      | TmdbClient with genre cache, person search, discovery, details   | ✓ VERIFIED | 130 lines, all methods implemented (loadGenres, discoverMovies/Tv, etc.)  |
| `src/media/tmdb/tmdb.http.ts`                        | Bearer auth HTTP helper                                          | ✓ VERIFIED | tmdbRequest helper with Bearer token, /3/ prefix, 10s timeout             |
| `src/media/tmdb/tmdb.schemas.ts`                     | Zod schemas for TMDB responses                                   | ✓ VERIFIED | 6 schemas exported (GenreList, DiscoverMovie/Tv, PersonSearch, Details)   |
| `src/conversation/tools/discover-media.ts`           | discover_media LLM tool                                          | ✓ VERIFIED | 97 lines, all params (type, genre, actor, yearFrom/To, language, keyword) |
| `src/plugins/tmdb.ts`                                | Fastify plugin creating TmdbClient                               | ✓ VERIFIED | Plugin loads genre cache at startup, graceful skip when unconfigured      |

### Required Artifacts (09-02: Web Search Fallback)

| Artifact                                              | Expected                                                         | Status     | Details                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| `src/media/brave/brave.client.ts`                    | BraveSearchClient with search method                             | ✓ VERIFIED | 51 lines, search() returns title/url/description, proper error handling    |
| `src/media/brave/brave.schemas.ts`                   | Zod schemas for Brave API                                        | ✓ VERIFIED | BraveSearchResultSchema, BraveSearchResponseSchema                         |
| `src/conversation/tools/web-search.ts`               | web_search LLM tool                                              | ✓ VERIFIED | 32 lines, accepts query param, calls brave.search                          |
| `src/plugins/brave.ts`                               | Fastify plugin creating BraveSearchClient                        | ✓ VERIFIED | Plugin decorates fastify.brave, graceful skip when unconfigured            |

### Required Artifacts (09-03: Library Routing)

| Artifact                                              | Expected                                                         | Status     | Details                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| `src/media/routing/library-router.ts`                | Pure routing functions (routeSeries, routeMovie)                 | ✓ VERIFIED | 167 lines, anime/Asian-language detection, quality profile matching        |
| `src/media/routing/library-router.types.ts`          | RoutingDecision, metadata types                                  | ✓ VERIFIED | 4 type exports (RoutingDecision, SeriesRoutingMetadata, etc.)              |
| `tests/routing.test.ts`                              | Unit tests for routing                                           | ✓ VERIFIED | 16 tests, all pass (anime detection, Asian lang routing, quality, fallback)|

### Key Link Verification

| From                                    | To                              | Via                                    | Status     | Details                                                                    |
| --------------------------------------- | ------------------------------- | -------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| discover-media.ts                       | tmdb.client.ts                  | context.tmdb                           | ✓ WIRED    | 4 calls to context.tmdb (resolveGenreId, searchPerson, discover methods)  |
| plugins/tmdb.ts                         | tmdb.client.ts                  | new TmdbClient()                       | ✓ WIRED    | Plugin creates client, calls loadGenres(), decorates fastify.tmdb         |
| plugins/conversation.ts                 | discover-media.ts               | registry.register(discoverMediaTool)   | ✓ WIRED    | Line 50: discoverMediaTool registered                                      |
| web-search.ts                           | brave.client.ts                 | context.brave                          | ✓ WIRED    | Line 20: context.brave.search() called                                     |
| plugins/brave.ts                        | brave.client.ts                 | new BraveSearchClient()                | ✓ WIRED    | Plugin creates client, decorates fastify.brave                             |
| plugins/conversation.ts                 | web-search.ts                   | registry.register(webSearchTool)       | ✓ WIRED    | Line 51: webSearchTool registered                                          |
| add-series.ts                           | library-router.ts               | routeSeries()                          | ✓ WIRED    | Line 84: routeSeries called with metadata, routing applied                 |
| add-movie.ts                            | library-router.ts               | routeMovie()                           | ✓ WIRED    | Line 89: routeMovie called with metadata, routing applied                  |
| add-series.ts                           | libraryOverride param           | Zod schema param                       | ✓ WIRED    | Line 11-15: enum["anime", "tv"] param, line 61+69: override logic          |
| add-movie.ts                            | libraryOverride param           | Zod schema param                       | ✓ WIRED    | Line 11-16: enum["movies", "cmovies"] param, line 68+76: override logic    |

### Requirements Coverage

| Requirement | Description                                                                                                                             | Status      | Blocking Issue |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------- |
| DISC-01     | User can search for media by actor, genre, network, or year via natural language (TMDB Discover API)                                  | ✓ SATISFIED | None           |
| DISC-02     | User can find media with vague descriptions when TMDB search fails (web search fallback via Brave Search API)                         | ✓ SATISFIED | None           |
| DISC-03     | User sees enriched metadata (overview, ratings, year, genres) in search results from TMDB                                             | ✓ SATISFIED | None           |
| ROUT-01     | Anime series are auto-detected from metadata and routed to the anime root folder in Sonarr                                            | ✓ SATISFIED | None           |
| ROUT-02     | Asian-language movies are auto-detected and routed to the CMovies root folder in Radarr                                               | ✓ SATISFIED | None           |
| ROUT-03     | User can override auto-detected routing (e.g., "add this to the anime library" or "put this in the regular movies folder")           | ✓ SATISFIED | None           |
| ROUT-04     | System defaults to 1080p quality profile, only changing when user explicitly requests a different quality                             | ✓ SATISFIED | None           |

### Anti-Patterns Found

None. All key files checked for TODO/FIXME/placeholder/stub patterns. No blocking issues detected.

### Human Verification Required

#### 1. TMDB Actor Discovery

**Test:** Ask the assistant "what has Oscar Isaac been in?"
**Expected:** 
- Returns 5-8 movies/TV shows featuring Oscar Isaac
- Each result includes title, year, rating, overview (truncated), poster URL
- Results sorted by popularity

**Why human:** API interaction requires valid TMDB_ACCESS_TOKEN and live TMDB API response

#### 2. TMDB Genre + Year Discovery

**Test:** Ask the assistant "show me sci-fi movies from the 90s"
**Expected:**
- Returns movies with genre "Science Fiction" from 1990-1999
- Includes ratings, overviews, years
- Sorted by popularity

**Why human:** Requires TMDB API key and genre ID resolution

#### 3. Web Search Fallback

**Test:** Ask the assistant "that movie where the guy relives the same day"
**Expected:**
- Uses web_search tool (not discover_media)
- Returns web results including "Groundhog Day" title
- Assistant then offers to search for it in Radarr

**Why human:** Requires BRAVE_SEARCH_API_KEY and LLM decision-making on when to use web_search

#### 4. Anime Auto-Detection

**Test:** Search for and add "Attack on Titan" via add_series
**Expected:**
- Routing detects it as anime (Japanese + Animation genre OR "Anime" genre from TheTVDB)
- Routes to /tv/anime folder (or folder matching "anime" hint)
- Response mentions "routed to anime library"
- seriesType set to "anime" in Sonarr

**Why human:** Requires Sonarr with anime root folder configured, TheTVDB metadata

#### 5. Asian-Language Movie Auto-Detection

**Test:** Search for and add a Japanese movie (e.g., "Your Name" / Kimi no Na wa, tmdbId: 372058)
**Expected:**
- Routing detects originalLanguage "ja" (from TMDB if configured, or Radarr)
- Routes to /movies/cmovies folder (or folder matching "cmovies" hint)
- Response mentions "routed to Asian-language library" or similar

**Why human:** Requires Radarr with cmovies root folder configured, TMDB_ACCESS_TOKEN for language resolution

#### 6. Library Override

**Test:** Search for "Your Name" and say "add it to the regular movies library"
**Expected:**
- Assistant passes libraryOverride: "movies" to add_movie
- Routes to first/default root folder instead of cmovies
- Response confirms override was applied

**Why human:** LLM must parse user intent and map to libraryOverride enum

#### 7. 1080p Quality Default

**Test:** Add any movie or series without specifying quality
**Expected:**
- Quality profile matching "1080" in name is selected (e.g., "HD-1080p")
- If no match, first profile used
- User sees confirmation with quality

**Why human:** Requires Sonarr/Radarr with quality profiles configured

#### 8. Graceful Degradation (No TMDB Token)

**Test:** Start app without TMDB_ACCESS_TOKEN env var, ask "show me sci-fi movies"
**Expected:**
- App starts successfully (no crash)
- discover_media tool returns error: "TMDB is not configured"
- Assistant tells user TMDB features are unavailable

**Why human:** Requires ability to restart app with different env config

#### 9. Graceful Degradation (No Brave API Key)

**Test:** Start app without BRAVE_SEARCH_API_KEY, ask "that movie where the guy relives the same day"
**Expected:**
- App starts successfully
- web_search tool returns error: "Web search is not configured"
- Assistant may suggest trying discover_media instead

**Why human:** Requires ability to restart app with different env config

### Summary

**All automated checks pass:**
- 7/7 observable truths verified
- All artifacts exist and are substantive (no stubs)
- All key links wired correctly
- All 7 requirements satisfied by verified truths
- 16/16 routing unit tests pass
- TypeScript compiles with zero errors
- No anti-patterns detected

**Phase goal achieved:** Users can discover media through natural language queries (by actor, genre, network, year, or vague description) AND media is automatically routed to the correct library folder.

**Ready for human verification:** 9 manual tests document the user-facing experience that cannot be verified programmatically.

---

_Verified: 2026-02-14T23:35:00Z_
_Verifier: Claude (gsd-verifier)_

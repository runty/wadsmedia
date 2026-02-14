# Phase 9: TMDB Discovery + Library Routing - Research

**Researched:** 2026-02-14
**Domain:** TMDB API integration (discovery, person search, metadata), Brave Search API fallback, smart library routing (anime detection, Asian-language movie detection)
**Confidence:** HIGH

## Summary

Phase 9 adds three capabilities: (1) a TMDB client enabling structured media discovery by actor, genre, network, year, or language; (2) a Brave Search API fallback for vague user queries that cannot be resolved via TMDB structured search; and (3) smart library routing that auto-detects anime series and Asian-language movies from metadata and routes them to the correct Sonarr/Radarr root folders.

The existing codebase provides clear integration points. The `apiRequest` pattern in `src/media/http.ts` uses `X-Api-Key` auth and `/api/v3/` path prefix (Sonarr/Radarr convention), which does not fit TMDB or Brave Search APIs. A separate `tmdbRequest` helper with Bearer token auth and `/3/` prefix is needed. The `ToolContext` interface needs `tmdb` added. The `add_movie` and `add_series` tool executors currently hardcode `rootFolders[0]` and `qualityProfiles[0]`, which must be replaced with routing-aware selection logic. The existing tool count is 10 (including `check_status`); the prior decision to keep total tools under 15 means Phase 9 should add at most 2 new tools (one `discover_media` for TMDB, one `web_search` for Brave), not one per endpoint.

**Primary recommendation:** Build a `TmdbClient` class following the `SonarrClient`/`RadarrClient` pattern, expose a single `discover_media` LLM tool with a union parameter schema covering both movie and TV discovery, and implement library routing as pure functions that take metadata and return `{ rootFolderPath, qualityProfileId, seriesType?, reason }`.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native `fetch()` | Node 22 built-in | TMDB API client, Brave Search API client | Project convention: zero external HTTP dependencies. Existing `apiRequest` in `src/media/http.ts` proves the pattern. |
| Zod | ^4.3.6 (existing) | Response validation for TMDB/Brave APIs | Already used for all Sonarr/Radarr response validation. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| No new dependencies | N/A | Everything in Phase 9 uses existing stack | All three plans (TMDB client, web search fallback, library routing) are implemented with `fetch()` + Zod + pure logic |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `fetch()` for TMDB | `tmdb-ts` v2.0.2 | Adds a dependency for what `fetch()` + Zod does better. tmdb-ts uses its own type system instead of Zod. Only justified if TMDB surface grows beyond ~12 endpoints. |
| Brave Search API | Tavily API ($0.01/search) | AI-optimized search results, purpose-built for LLM tool use. More expensive. Consider if Brave quality proves insufficient. |
| Brave Search API | DuckDuckGo API | DuckDuckGo API is extremely limited (instant answers only, no structured web results). Not viable for media discovery fallback. |

**Installation:**
```bash
# No new npm dependencies for Phase 9
```

## Architecture Patterns

### Recommended Project Structure

```
src/media/
  tmdb/
    tmdb.client.ts       # TmdbClient class (same pattern as SonarrClient/RadarrClient)
    tmdb.http.ts          # TMDB-specific HTTP helper (Bearer auth, /3/ prefix)
    tmdb.schemas.ts       # Zod schemas for TMDB API responses
    tmdb.types.ts         # TypeScript types inferred from schemas
  brave/
    brave.client.ts       # BraveSearchClient class
    brave.schemas.ts      # Zod schemas for Brave Search responses
    brave.types.ts        # TypeScript types inferred from schemas
  routing/
    library-router.ts     # Pure routing functions (no side effects, no API calls)
    library-router.types.ts # RoutingDecision type
src/conversation/tools/
    discover-media.ts     # Single discover_media tool (covers both movie + TV discovery)
    web-search.ts         # Single web_search tool (Brave Search fallback)
src/plugins/
    tmdb.ts               # Fastify plugin: create TmdbClient, load genre cache, decorate
```

### Pattern 1: Separate HTTP Helper for Different Auth Schemes

**What:** Create `tmdb.http.ts` as a TMDB-specific request helper, separate from the existing `apiRequest` in `src/media/http.ts`. The existing helper hardcodes `X-Api-Key` header and `/api/v3/` path prefix for Sonarr/Radarr. TMDB uses `Authorization: Bearer {token}` and `/3/` prefix. Brave uses `X-Subscription-Token` header.

**When to use:** Any API integration where auth or URL structure differs from Sonarr/Radarr.

**Example:**
```typescript
// src/media/tmdb/tmdb.http.ts
import type { z } from "zod";
import { ConnectionError, MediaServerError, ValidationError } from "../errors.js";

export interface TmdbRequestOptions {
  accessToken: string;
  path: string; // e.g. "search/movie" (no leading slash, no /3/ prefix)
  query?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export async function tmdbRequest<T>(
  options: TmdbRequestOptions,
  schema: z.ZodType<T>,
): Promise<T> {
  const { accessToken, path, query, timeoutMs = 10_000 } = options;

  const url = new URL(`${TMDB_BASE_URL}/${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: unknown) {
    if (err instanceof TypeError) {
      throw new ConnectionError("TMDB API is unreachable.");
    }
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ConnectionError("TMDB API did not respond within the timeout period.");
    }
    throw err;
  }

  if (response.status === 429) {
    throw new MediaServerError(429, "TMDB rate limit exceeded. Retry shortly.");
  }

  if (!response.ok) {
    throw new MediaServerError(response.status, await response.text());
  }

  const json: unknown = await response.json();
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ValidationError(path, result.error);
  }
  return result.data;
}
```

**Source:** Existing `src/media/http.ts` (codebase), TMDB API auth docs (https://developer.themoviedb.org/reference/intro/getting-started)

### Pattern 2: Pure Routing Functions (No Side Effects)

**What:** Library routing is implemented as pure functions that receive metadata and return a routing decision. The routing functions never call APIs themselves. Metadata is fetched by the tool executor and passed to the router.

**When to use:** Any decision logic that should be easily testable and decoupled from API calls.

**Example:**
```typescript
// src/media/routing/library-router.ts
import type { RootFolder, QualityProfile } from "../sonarr/sonarr.types.js";

export interface RoutingDecision {
  rootFolderPath: string;
  qualityProfileId: number;
  seriesType?: "standard" | "daily" | "anime";
  reason: string;
}

export interface SeriesRoutingMetadata {
  genres: string[];           // from Sonarr lookup (e.g. ["Animation", "Action"])
  originalLanguage?: string;  // ISO 639-1 from TMDB (e.g. "ja")
  network?: string | null;    // from Sonarr lookup
}

const ANIME_SIGNALS = {
  japaneseLanguage: (meta: SeriesRoutingMetadata) => meta.originalLanguage === "ja",
  animationGenre: (meta: SeriesRoutingMetadata) =>
    meta.genres.some((g) => g.toLowerCase() === "animation" || g.toLowerCase() === "anime"),
};

export function routeSeries(
  metadata: SeriesRoutingMetadata,
  rootFolders: RootFolder[],
  qualityProfiles: QualityProfile[],
  config: { animeRootFolderHint?: string; defaultQualityHint?: string },
): RoutingDecision {
  const isAnime =
    ANIME_SIGNALS.japaneseLanguage(metadata) && ANIME_SIGNALS.animationGenre(metadata);

  if (isAnime && config.animeRootFolderHint) {
    const animeFolder = rootFolders.find((f) =>
      f.path.toLowerCase().includes(config.animeRootFolderHint!.toLowerCase()),
    );
    if (animeFolder) {
      return {
        rootFolderPath: animeFolder.path,
        qualityProfileId: findQualityProfile(qualityProfiles, config.defaultQualityHint),
        seriesType: "anime",
        reason: `Detected as anime (Japanese + Animation genre)`,
      };
    }
  }

  return {
    rootFolderPath: rootFolders[0].path,
    qualityProfileId: findQualityProfile(qualityProfiles, config.defaultQualityHint),
    seriesType: "standard",
    reason: "Standard TV series (default routing)",
  };
}
```

### Pattern 3: Single Compound Tool Over Multiple Narrow Tools

**What:** Expose one `discover_media` tool with a discriminated union schema (`type: "movie" | "tv"`) rather than separate `discover_movies` and `discover_tv` tools. Similarly, one `web_search` tool rather than multiple search tools.

**When to use:** When tool count is constrained (prior decision: under 15 total).

**Example:**
```typescript
// Tool parameter schema for discover_media
const discoverMediaParams = z.object({
  type: z.enum(["movie", "tv"]).describe("Whether to search for movies or TV shows"),
  genre: z.string().optional().describe("Genre name, e.g. 'sci-fi', 'comedy', 'drama'"),
  actor: z.string().optional().describe("Actor name, e.g. 'Oscar Isaac'"),
  yearFrom: z.number().optional().describe("Earliest release year"),
  yearTo: z.number().optional().describe("Latest release year"),
  language: z.string().optional().describe("Original language ISO code, e.g. 'ko', 'ja'"),
  keyword: z.string().optional().describe("Keyword or theme, e.g. 'time travel', 'zombies'"),
});
// Tool count: v1.0 has 10 tools. Phase 9 adds discover_media + web_search = 12 total.
```

### Anti-Patterns to Avoid

- **Fat library router with external calls:** Do NOT have the routing function call TMDB or Sonarr APIs internally. It receives metadata, returns a decision. The tool executor orchestrates.
- **One tool per TMDB endpoint:** Do NOT create `tmdb_search_movies`, `tmdb_search_tv`, `tmdb_discover_movies`, `tmdb_discover_tv`, `tmdb_search_person` as separate LLM tools. This would add 5 tools, pushing total to 15+ and degrading LLM tool selection accuracy.
- **Duplicating Sonarr/Radarr search:** Do NOT call TMDB search when the user is searching by title. Sonarr's `/series/lookup` and Radarr's `/movie/lookup` already proxy TMDB/TVDB. TMDB is only for discovery (genre/actor/year/network filters) that Sonarr/Radarr do not expose.
- **Routing by folder path strings:** Do NOT use string matching on root folder paths to guess which folder is for anime vs TV. Use a config hint (env var like `SONARR_ANIME_ROOT_FOLDER_HINT=anime`) and match against folder paths.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TMDB genre name-to-ID mapping | Dynamic lookup on every request | Static lookup table loaded once at startup via `/3/genre/movie/list` and `/3/genre/tv/list`, cached on TmdbClient | Genre IDs are stable. Fetching once avoids repeated API calls. |
| TMDB person name-to-ID resolution | Custom fuzzy matching | TMDB `/3/search/person?query=` endpoint | Returns ranked results by popularity. One API call. |
| TMDB image URL construction | String concatenation inline | Utility function `tmdbImageUrl(path, size)` | Handles null poster_path gracefully, validates size parameter, centralizes base URL. |
| Anime classification rules | Complex genre/keyword/language heuristics | Two-signal rule (Japanese language + Animation genre) with configurable override | Simple, high accuracy for 90%+ of cases. User override covers the rest. |
| Rate limiting for TMDB | Custom token bucket | Simple 429-retry with exponential backoff | TMDB allows ~40 req/sec. WadsMedia generates maybe 5 req/sec peak. 429 handling is sufficient. |

**Key insight:** Phase 9 is primarily an integration phase, not a framework phase. The hard parts are getting the TMDB API parameters right, designing good tool schemas for the LLM, and handling routing edge cases. There is nothing novel to build from scratch.

## Common Pitfalls

### Pitfall 1: Tool Count Explosion Degrading LLM Accuracy

**What goes wrong:** v1.0 has 10 tools. Adding separate tools for TMDB search, TMDB discover movies, TMDB discover TV, person search, web search, and routing override could push count to 16+. LLM tool selection accuracy degrades noticeably past 15 tools. Token consumption per request increases (tool definitions alone consume 8-15k tokens with 20+ tools).

**Why it happens:** Each TMDB endpoint feels like a natural tool. Developers add one tool per API capability.

**How to avoid:** Consolidate into 2 new tools: `discover_media` (single tool covering movie + TV discovery with optional genre/actor/year/language/keyword params) and `web_search` (Brave Search fallback). Internal TMDB calls (person search, genre lookup) happen inside the tool executor, not as separate tools. Target: 12 total tools after Phase 9 (10 existing + 2 new).

**Warning signs:** LLM calling `search_movies` when it should call `discover_media` or vice versa; tool call loop iterations increasing from 1-2 to 3-4; token usage climbing above 10k for simple queries.

### Pitfall 2: TMDB Image URLs Constructed Wrong

**What goes wrong:** TMDB returns partial paths like `/kqjL17yufvn9OVLyXYpvtyrFfak.jpg` in `poster_path`. These must be combined with `https://image.tmdb.org/t/p/{size}` to form full URLs. Using an invalid size (e.g. `w360` instead of `w342`) returns 404. `poster_path` can be `null` for obscure titles.

**Why it happens:** Developers accustomed to APIs that return full URLs (like Sonarr/Radarr image URLs) concatenate the TMDB path incorrectly or forget to handle null.

**How to avoid:** Build a utility function:
```typescript
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
const VALID_SIZES = ["w92", "w154", "w185", "w342", "w500", "w780", "original"] as const;

export function tmdbImageUrl(
  path: string | null | undefined,
  size: (typeof VALID_SIZES)[number] = "w500",
): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}
```

**Warning signs:** 404 errors when loading posters; `null` poster URLs causing downstream failures in tool response formatting.

### Pitfall 3: Smart Routing Misclassification

**What goes wrong:** "Avatar: The Last Airbender" (2024 Netflix live-action) classified as anime. "Cowboy Bebop" (2021 Netflix live-action) classified as anime. A Korean drama classified as anime because it has Animation genre. An English-language anime like "Castlevania" not classified as anime because `original_language` is "en".

**Why it happens:** Anime is not a binary classification. TMDB genres include "Animation" but not "Anime" as a genre. The two-signal rule (Japanese + Animation) covers most cases but misses edge cases.

**How to avoid:**
1. Require BOTH signals (Japanese language AND Animation genre) -- this is intentionally conservative, preferring false negatives over false positives (better to put anime in regular TV than regular TV in anime folder).
2. Allow user override: "add this to the anime library" or "put this in regular TV" via the existing tool parameter or conversational instruction.
3. Sonarr's lookup response includes a `genres` array. If "Anime" appears explicitly as a genre string, that is a strong signal regardless of language.
4. For Radarr Asian-language routing, `originalLanguage` from the lookup response is authoritative (it's a TMDB-sourced field). The `.passthrough()` on `MovieLookupSchema` preserves this field at runtime, but it needs to be added to the Zod schema for type safety.

**Warning signs:** Media appearing in wrong Plex library sections; users reporting wrong folder placement; routing logic using string matching on folder paths.

### Pitfall 4: TMDB Discover Parameters Require IDs, Not Names

**What goes wrong:** The LLM provides genre name "sci-fi" but TMDB `with_genres` requires integer ID 878 (movie) or 10765 (TV). The LLM provides actor name "Oscar Isaac" but `with_cast` requires person ID (numeric). Passing names instead of IDs results in empty results, not errors.

**Why it happens:** The discover endpoint silently ignores invalid filter values rather than returning errors.

**How to avoid:** The `discover_media` tool executor must resolve names to IDs internally:
1. Genre name -> genre ID via cached lookup table (loaded at startup from `/3/genre/movie/list` and `/3/genre/tv/list`)
2. Actor/director name -> person ID via `/3/search/person?query=`
3. If resolution fails, return a clear error to the LLM explaining what could not be resolved.

### Pitfall 5: Radarr `originalLanguage` Not in Zod Schema

**What goes wrong:** The Radarr movie lookup schema uses `.passthrough()`, so `originalLanguage` exists at runtime but is untyped. Accessing `movie.originalLanguage` works but TypeScript does not know about it. If Radarr ever drops this field, the code breaks silently.

**Why it happens:** The initial schema was designed conservatively with `.passthrough()` to avoid breaking on unknown fields.

**How to avoid:** Add `originalLanguage` to `MovieLookupSchema` in `src/media/radarr/radarr.schemas.ts`:
```typescript
// Add to MovieLookupSchema
originalLanguage: z.object({
  id: z.number(),
  name: z.string(),
}).optional(),
```

This makes routing type-safe. The `.optional()` handles cases where the field might be absent.

## Code Examples

### TMDB Client Class

```typescript
// src/media/tmdb/tmdb.client.ts
// Source: Existing SonarrClient/RadarrClient pattern + TMDB API docs
import { tmdbRequest } from "./tmdb.http.js";
import {
  DiscoverMovieResponseSchema,
  DiscoverTvResponseSchema,
  GenreListSchema,
  PersonSearchResponseSchema,
  MovieDetailSchema,
  TvDetailSchema,
} from "./tmdb.schemas.js";
import type { GenreMap, DiscoverMovieResult, DiscoverTvResult, PersonSearchResult } from "./tmdb.types.js";

export class TmdbClient {
  private readonly accessToken: string;
  movieGenres: GenreMap = new Map();
  tvGenres: GenreMap = new Map();

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /** Load genre ID maps at startup. Called once by the Fastify plugin. */
  async loadGenres(): Promise<void> {
    const [movieGenres, tvGenres] = await Promise.all([
      tmdbRequest({ accessToken: this.accessToken, path: "genre/movie/list" }, GenreListSchema),
      tmdbRequest({ accessToken: this.accessToken, path: "genre/tv/list" }, GenreListSchema),
    ]);
    this.movieGenres = new Map(movieGenres.genres.map((g) => [g.name.toLowerCase(), g.id]));
    this.tvGenres = new Map(tvGenres.genres.map((g) => [g.name.toLowerCase(), g.id]));
  }

  /** Resolve a genre name to a TMDB genre ID. */
  resolveGenreId(name: string, type: "movie" | "tv"): number | undefined {
    const map = type === "movie" ? this.movieGenres : this.tvGenres;
    // Try exact match first, then fuzzy
    return map.get(name.toLowerCase())
      ?? [...map.entries()].find(([k]) => k.includes(name.toLowerCase()))?.[1];
  }

  /** Search for a person by name, return top match ID. */
  async searchPerson(query: string): Promise<PersonSearchResult | null> {
    const result = await tmdbRequest(
      { accessToken: this.accessToken, path: "search/person", query: { query } },
      PersonSearchResponseSchema,
    );
    return result.results[0] ?? null;
  }

  /** Discover movies with structured filters. */
  async discoverMovies(params: {
    withGenres?: string;       // comma-separated genre IDs
    withCast?: string;         // comma-separated person IDs
    primaryReleaseYear?: number;
    primaryReleaseDateGte?: string;
    primaryReleaseDateLte?: string;
    withOriginalLanguage?: string;
    sortBy?: string;
    voteCountGte?: number;
    page?: number;
  }): Promise<DiscoverMovieResult> {
    const query: Record<string, string | number | boolean> = {};
    if (params.withGenres) query.with_genres = params.withGenres;
    if (params.withCast) query.with_cast = params.withCast;
    if (params.primaryReleaseYear) query.primary_release_year = params.primaryReleaseYear;
    if (params.primaryReleaseDateGte) query["primary_release_date.gte"] = params.primaryReleaseDateGte;
    if (params.primaryReleaseDateLte) query["primary_release_date.lte"] = params.primaryReleaseDateLte;
    if (params.withOriginalLanguage) query.with_original_language = params.withOriginalLanguage;
    if (params.sortBy) query.sort_by = params.sortBy;
    if (params.voteCountGte) query["vote_count.gte"] = params.voteCountGte;
    if (params.page) query.page = params.page;

    return tmdbRequest(
      { accessToken: this.accessToken, path: "discover/movie", query },
      DiscoverMovieResponseSchema,
    );
  }

  /** Discover TV shows with structured filters. */
  async discoverTv(params: {
    withGenres?: string;
    withNetworks?: string;
    firstAirDateYear?: number;
    firstAirDateGte?: string;
    firstAirDateLte?: string;
    withOriginalLanguage?: string;
    sortBy?: string;
    voteCountGte?: number;
    page?: number;
  }): Promise<DiscoverTvResult> {
    const query: Record<string, string | number | boolean> = {};
    if (params.withGenres) query.with_genres = params.withGenres;
    if (params.withNetworks) query.with_networks = params.withNetworks;
    if (params.firstAirDateYear) query.first_air_date_year = params.firstAirDateYear;
    if (params.firstAirDateGte) query["first_air_date.gte"] = params.firstAirDateGte;
    if (params.firstAirDateLte) query["first_air_date.lte"] = params.firstAirDateLte;
    if (params.withOriginalLanguage) query.with_original_language = params.withOriginalLanguage;
    if (params.sortBy) query.sort_by = params.sortBy;
    if (params.voteCountGte) query["vote_count.gte"] = params.voteCountGte;
    if (params.page) query.page = params.page;

    return tmdbRequest(
      { accessToken: this.accessToken, path: "discover/tv", query },
      DiscoverTvResponseSchema,
    );
  }

  /** Get movie details (for routing metadata). */
  async getMovieDetails(tmdbId: number) {
    return tmdbRequest(
      { accessToken: this.accessToken, path: `movie/${tmdbId}` },
      MovieDetailSchema,
    );
  }

  /** Get TV details (for routing metadata). */
  async getTvDetails(tmdbId: number) {
    return tmdbRequest(
      { accessToken: this.accessToken, path: `tv/${tmdbId}` },
      TvDetailSchema,
    );
  }
}
```

### Brave Search Client

```typescript
// src/media/brave/brave.client.ts
// Source: Brave Search API docs (https://api-dashboard.search.brave.com/app/documentation/web-search/query)
import type { z } from "zod";
import { ConnectionError, MediaServerError, ValidationError } from "../errors.js";
import { BraveSearchResponseSchema } from "./brave.schemas.js";
import type { BraveSearchResult } from "./brave.types.js";

const BRAVE_BASE_URL = "https://api.search.brave.com/res/v1/web/search";

export class BraveSearchClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, count = 5): Promise<BraveSearchResult[]> {
    const url = new URL(BRAVE_BASE_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(count));

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          "X-Subscription-Token": this.apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err: unknown) {
      if (err instanceof TypeError) {
        throw new ConnectionError("Brave Search API is unreachable.");
      }
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new ConnectionError("Brave Search API did not respond within timeout.");
      }
      throw err;
    }

    if (!response.ok) {
      throw new MediaServerError(response.status, await response.text());
    }

    const json: unknown = await response.json();
    const result = BraveSearchResponseSchema.safeParse(json);
    if (!result.success) {
      throw new ValidationError("brave/web/search", result.error);
    }

    return result.data.web?.results ?? [];
  }
}
```

### TMDB Zod Schemas (Key Responses)

```typescript
// src/media/tmdb/tmdb.schemas.ts
import { z } from "zod";

/** Paginated response wrapper used by search and discover endpoints. */
const PaginatedSchema = <T extends z.ZodType>(resultSchema: T) =>
  z.object({
    page: z.number(),
    results: z.array(resultSchema),
    total_pages: z.number(),
    total_results: z.number(),
  });

/** Genre object from genre list endpoint. */
export const GenreSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export const GenreListSchema = z.object({
  genres: z.array(GenreSchema),
});

/** Movie result from discover/movie or search/movie. */
export const DiscoverMovieItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  original_title: z.string().optional(),
  overview: z.string().nullable(),
  release_date: z.string().nullable().optional(),
  genre_ids: z.array(z.number()),
  original_language: z.string(),
  vote_average: z.number(),
  vote_count: z.number(),
  poster_path: z.string().nullable(),
  backdrop_path: z.string().nullable().optional(),
  popularity: z.number(),
  adult: z.boolean().optional(),
}).passthrough();

export const DiscoverMovieResponseSchema = PaginatedSchema(DiscoverMovieItemSchema);

/** TV result from discover/tv or search/tv. */
export const DiscoverTvItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  original_name: z.string().optional(),
  overview: z.string().nullable(),
  first_air_date: z.string().nullable().optional(),
  genre_ids: z.array(z.number()),
  original_language: z.string(),
  origin_country: z.array(z.string()),
  vote_average: z.number(),
  vote_count: z.number(),
  poster_path: z.string().nullable(),
  backdrop_path: z.string().nullable().optional(),
  popularity: z.number(),
}).passthrough();

export const DiscoverTvResponseSchema = PaginatedSchema(DiscoverTvItemSchema);

/** Person from search/person. */
export const PersonSchema = z.object({
  id: z.number(),
  name: z.string(),
  popularity: z.number(),
  profile_path: z.string().nullable().optional(),
  known_for_department: z.string().optional(),
}).passthrough();

export const PersonSearchResponseSchema = PaginatedSchema(PersonSchema);

/** Movie detail (for routing metadata). */
export const MovieDetailSchema = z.object({
  id: z.number(),
  title: z.string(),
  original_language: z.string(),
  genres: z.array(GenreSchema),
  overview: z.string().nullable(),
  release_date: z.string().nullable().optional(),
  vote_average: z.number(),
  vote_count: z.number(),
  poster_path: z.string().nullable(),
  production_countries: z.array(z.object({
    iso_3166_1: z.string(),
    name: z.string(),
  })).optional(),
  spoken_languages: z.array(z.object({
    iso_639_1: z.string(),
    name: z.string(),
  })).optional(),
}).passthrough();

/** TV series detail (for routing metadata). */
export const TvDetailSchema = z.object({
  id: z.number(),
  name: z.string(),
  original_language: z.string(),
  origin_country: z.array(z.string()),
  genres: z.array(GenreSchema),
  overview: z.string().nullable(),
  first_air_date: z.string().nullable().optional(),
  vote_average: z.number(),
  vote_count: z.number(),
  poster_path: z.string().nullable(),
  number_of_seasons: z.number().optional(),
}).passthrough();
```

### Brave Search Zod Schema

```typescript
// src/media/brave/brave.schemas.ts
import { z } from "zod";

export const BraveSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  description: z.string(),
}).passthrough();

export const BraveSearchResponseSchema = z.object({
  web: z.object({
    results: z.array(BraveSearchResultSchema),
  }).optional(),
  query: z.object({
    original: z.string(),
  }).optional(),
}).passthrough();
```

### discover_media Tool Executor (Sketch)

```typescript
// src/conversation/tools/discover-media.ts
// Source: Existing defineTool pattern in codebase
import { z } from "zod";
import { defineTool } from "../tools.js";
import { tmdbImageUrl } from "../../media/tmdb/tmdb.utils.js";

export const discoverMediaTool = defineTool(
  "discover_media",
  "Discover movies or TV shows by genre, actor, year, language, or keyword. Use for requests like 'sci-fi movies from the 90s', 'what has Oscar Isaac been in', or 'Korean dramas'. NOT for title search -- use search_movies/search_series for title lookups.",
  z.object({
    type: z.enum(["movie", "tv"]).describe("Whether to discover movies or TV shows"),
    genre: z.string().optional().describe("Genre name (e.g. 'sci-fi', 'comedy', 'horror', 'drama', 'animation')"),
    actor: z.string().optional().describe("Actor name (e.g. 'Oscar Isaac', 'Florence Pugh')"),
    yearFrom: z.number().optional().describe("Earliest year (e.g. 1990)"),
    yearTo: z.number().optional().describe("Latest year (e.g. 1999)"),
    language: z.string().optional().describe("Original language ISO 639-1 code (e.g. 'ko' for Korean, 'ja' for Japanese)"),
    keyword: z.string().optional().describe("Theme or keyword (e.g. 'time travel', 'zombies')"),
  }),
  "safe",
  async (args, context) => {
    if (!context.tmdb) {
      return { error: "TMDB is not configured (set TMDB_ACCESS_TOKEN)" };
    }

    // Resolve genre name to ID
    let genreId: string | undefined;
    if (args.genre) {
      const id = context.tmdb.resolveGenreId(args.genre, args.type);
      if (id) genreId = String(id);
      // If genre not found, try anyway -- the user might have used a close enough name
    }

    // Resolve actor name to person ID
    let castId: string | undefined;
    if (args.actor) {
      const person = await context.tmdb.searchPerson(args.actor);
      if (person) castId = String(person.id);
      else return { error: `Could not find actor "${args.actor}" on TMDB` };
    }

    if (args.type === "movie") {
      const results = await context.tmdb.discoverMovies({
        withGenres: genreId,
        withCast: castId,
        primaryReleaseDateGte: args.yearFrom ? `${args.yearFrom}-01-01` : undefined,
        primaryReleaseDateLte: args.yearTo ? `${args.yearTo}-12-31` : undefined,
        withOriginalLanguage: args.language,
        sortBy: "popularity.desc",
        voteCountGte: 50,
      });

      return {
        results: results.results.slice(0, 8).map((m) => ({
          title: m.title,
          year: m.release_date?.split("-")[0] ?? null,
          tmdbId: m.id,
          overview: m.overview && m.overview.length > 150
            ? `${m.overview.slice(0, 150)}...` : m.overview,
          rating: m.vote_average,
          posterUrl: tmdbImageUrl(m.poster_path),
          language: m.original_language,
        })),
        totalResults: results.total_results,
      };
    }

    // TV discovery
    const results = await context.tmdb.discoverTv({
      withGenres: genreId,
      firstAirDateGte: args.yearFrom ? `${args.yearFrom}-01-01` : undefined,
      firstAirDateLte: args.yearTo ? `${args.yearTo}-12-31` : undefined,
      withOriginalLanguage: args.language,
      sortBy: "popularity.desc",
      voteCountGte: 50,
    });

    return {
      results: results.results.slice(0, 8).map((s) => ({
        title: s.name,
        year: s.first_air_date?.split("-")[0] ?? null,
        tmdbId: s.id,
        overview: s.overview && s.overview.length > 150
          ? `${s.overview.slice(0, 150)}...` : s.overview,
        rating: s.vote_average,
        posterUrl: tmdbImageUrl(s.poster_path),
        language: s.original_language,
        originCountry: s.origin_country,
      })),
      totalResults: results.total_results,
    };
  },
);
```

### Modified add_series with Smart Routing (Sketch)

```typescript
// Key change in add-series.ts executor
// BEFORE: const rootFolder = context.sonarr.rootFolders[0];
// AFTER:
import { routeSeries } from "../../media/routing/library-router.js";

// Inside executor, after Sonarr lookup but before addSeries:
let routingMetadata: SeriesRoutingMetadata = {
  genres: series.genres,            // from Sonarr lookup (already available)
  network: series.network,          // from Sonarr lookup (already available)
};

// If TMDB is configured, enrich with original_language for better routing
if (context.tmdb && series.tvdbId) {
  try {
    // Sonarr lookup may include tmdbId in passthrough data, or search TMDB by title
    // For now, use genres from Sonarr which is sufficient for the primary signals
  } catch {
    // TMDB enrichment failed, proceed with Sonarr-only metadata
  }
}

const routing = routeSeries(
  routingMetadata,
  context.sonarr.rootFolders,
  context.sonarr.qualityProfiles,
  { animeRootFolderHint: config.SONARR_ANIME_ROOT_FOLDER_HINT },
);

const added = await context.sonarr.addSeries({
  ...seriesInput,
  rootFolderPath: routing.rootFolderPath,
  qualityProfileId: routing.qualityProfileId,
  seriesType: routing.seriesType,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TMDB per-10-second rate limit | ~40 req/sec soft limit with 429 on excess | 2024+ | Generous for WadsMedia's use case. Just handle 429. |
| TMDB v3 API with API key query param | TMDB v3 API with Bearer token auth | Still current | Bearer token is the recommended auth method. Query param key still works but Bearer is preferred. |
| Sonarr series type as manual setting | Sonarr accepts `seriesType` in AddSeries API body | v3 API | Can set "anime" at add time, no manual intervention needed. |
| Radarr `originalLanguage` undocumented | `originalLanguage: { id, name }` confirmed in lookup response | Radarr v3+ | Available via `.passthrough()` in existing schema, needs explicit schema field. |

**Deprecated/outdated:**
- TMDB v3 API key-as-query-parameter auth: Still works but Bearer token is the documented approach. Use Bearer.
- Brave Search free tier pricing: Was $0 for up to 2,000 requests/month. Verify current pricing at signup. As of the STACK.md research, it was $5/month credit (~1,000 searches).

## Open Questions

1. **TMDB discover endpoint: does `with_cast` work for TV shows?**
   - What we know: The discover/movie endpoint supports `with_cast`. The discover/tv endpoint documentation lists different parameters.
   - What's unclear: Whether `with_cast` is supported on discover/tv or only discover/movie. TV discover may only support `with_networks` and `with_companies`.
   - Recommendation: Test at implementation time with a real API call. If `with_cast` is not supported for TV, use `search/multi` as a fallback for actor-based TV queries.
   - Confidence: MEDIUM

2. **Sonarr lookup response: does it include explicit "Anime" genre string?**
   - What we know: The Sonarr lookup response `genres` array contains strings like "Animation", "Action". The existing `SeriesLookupSchema` parses `genres: z.array(z.string())`.
   - What's unclear: Whether Sonarr ever returns "Anime" as a distinct genre string vs only "Animation". TheTVDB (Sonarr's source) does have an "Anime" genre.
   - Recommendation: Log Sonarr lookup genre data for known anime titles during development. If "Anime" appears, use it as a strong routing signal. If only "Animation" appears, rely on the two-signal rule (Animation + Japanese language).
   - Confidence: MEDIUM

3. **Brave Search API: is the free tier still available and what are current limits?**
   - What we know: STACK.md research says $5/month credit (~1,000 searches at $5/1,000 requests).
   - What's unclear: Whether free tier still exists in 2026. Pricing can change.
   - Recommendation: Verify at signup time. The web_search tool is optional (graceful degradation if not configured). Keep `BRAVE_SEARCH_API_KEY` optional in config.
   - Confidence: MEDIUM

4. **User override for routing: how should the LLM communicate routing preference?**
   - What we know: Users should be able to say "add this to anime library" or "put this in regular TV".
   - What's unclear: Whether to add a `libraryHint` parameter to `add_series`/`add_movie` tools, or handle it via system prompt instructions that modify the routing decision.
   - Recommendation: Add optional `libraryOverride` parameter to add tools (e.g. `libraryOverride: z.enum(["anime", "tv", "movies", "cmovies"]).optional()`). The routing function checks this first, before metadata-based detection. System prompt instructs LLM to pass override when user specifies.
   - Confidence: HIGH (straightforward, just need to decide the enum values)

5. **Default quality profile: how to select "1080p" by name?**
   - What we know: Requirement ROUT-04 says "system defaults to 1080p quality unless user requests otherwise." Quality profiles are identified by `id` (numeric) and `name` (string) in Sonarr/Radarr.
   - What's unclear: Quality profile names vary per installation (could be "HD-1080p", "1080p", "Any", etc.).
   - Recommendation: Add `DEFAULT_QUALITY_PROFILE_HINT` env var (default: "1080"). Match case-insensitively against quality profile names containing the hint. Fall back to first profile if no match.
   - Confidence: HIGH

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/media/http.ts`, `src/media/sonarr/`, `src/media/radarr/`, `src/conversation/tools/`, `src/conversation/tool-loop.ts`, `src/conversation/types.ts`, `src/config.ts` -- all directly read and analyzed
- TMDB API Getting Started: https://developer.themoviedb.org/reference/intro/getting-started -- authentication, base URL
- TMDB Search Person: https://developer.themoviedb.org/reference/search-person -- parameter names, response format
- TMDB Discover Movie: https://developer.themoviedb.org/reference/discover-movie -- "over 30 filters and sort options"
- TMDB Discover TV: https://developer.themoviedb.org/reference/discover-tv -- TV-specific filters
- TMDB Genre Movie List: https://developer.themoviedb.org/reference/genre-movie-list -- genre ID mappings
- TMDB Genre TV List: https://developer.themoviedb.org/reference/genre-tv-list -- TV genre ID mappings
- TMDB Image Basics: https://developer.themoviedb.org/docs/image-basics -- image URL construction, valid sizes
- Brave Search API Query Parameters: https://api-dashboard.search.brave.com/app/documentation/web-search/query -- endpoint, auth, params
- Brave Search API Responses: https://api-dashboard.search.brave.com/app/documentation/web-search/responses -- response structure
- Sonarr types in codebase: `AddSeriesInput.seriesType` supports `"standard" | "daily" | "anime"` -- verified in `src/media/sonarr/sonarr.types.ts`
- Radarr `originalLanguage` field: confirmed via GitHub issue #5970 and `.passthrough()` behavior in `src/media/radarr/radarr.schemas.ts`

### Secondary (MEDIUM confidence)
- TMDB genre IDs verified via WebSearch against community forum posts and gist: https://www.themoviedb.org/talk/5daf6eb0ae36680011d7e6ee
- Sonarr seriesType and anime detection: https://github.com/sct/overseerr/issues/3777 -- confirms seriesType "anime" triggers absolute episode search
- Radarr `originalLanguage` object format `{ id: number, name: string }`: confirmed via multiple search results including GitHub issue #5970

### Tertiary (LOW confidence)
- Brave Search free tier pricing ($5/month credit): from STACK.md research, needs verification at signup

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, existing patterns applied
- Architecture: HIGH -- TmdbClient/BraveSearchClient follow proven SonarrClient/RadarrClient pattern; routing is pure functions
- TMDB API integration: HIGH -- endpoints, auth, and response formats verified via official docs
- Brave Search integration: MEDIUM -- endpoint and auth verified, response schema partially verified
- Library routing logic: MEDIUM -- anime detection two-signal rule is sound but edge cases need runtime testing
- Tool count management: HIGH -- concrete plan: 2 new tools (discover_media + web_search) = 12 total

**TMDB Movie Genre IDs (verified):**
| Genre | ID |
|-------|----|
| Action | 28 |
| Adventure | 12 |
| Animation | 16 |
| Comedy | 35 |
| Crime | 80 |
| Documentary | 99 |
| Drama | 18 |
| Family | 10751 |
| Fantasy | 14 |
| History | 36 |
| Horror | 27 |
| Music | 10402 |
| Mystery | 9648 |
| Romance | 10749 |
| Science Fiction | 878 |
| TV Movie | 10770 |
| Thriller | 53 |
| War | 10752 |
| Western | 37 |

**TMDB TV Genre IDs (verified):**
| Genre | ID |
|-------|----|
| Action & Adventure | 10759 |
| Animation | 16 |
| Comedy | 35 |
| Crime | 80 |
| Documentary | 99 |
| Drama | 18 |
| Family | 10751 |
| Kids | 10762 |
| Mystery | 9648 |
| News | 10763 |
| Reality | 10764 |
| Sci-Fi & Fantasy | 10765 |
| Soap | 10766 |
| Talk | 10767 |
| War & Politics | 10768 |
| Western | 37 |

**Asian languages for Radarr CMovies routing:**
| Language | ISO 639-1 |
|----------|-----------|
| Japanese | ja |
| Korean | ko |
| Chinese (Mandarin/Cantonese) | zh |
| Thai | th |
| Hindi | hi |
| Tamil | ta |
| Telugu | te |
| Vietnamese | vi |
| Malay | ms |
| Tagalog | tl |
| Indonesian | id |

**Key env vars needed for Phase 9:**
```bash
TMDB_ACCESS_TOKEN=           # TMDB API v3 read access token (Bearer auth)
BRAVE_SEARCH_API_KEY=        # Brave Search API subscription token (optional)
SONARR_ANIME_ROOT_FOLDER_HINT=anime  # Substring to match in Sonarr root folder paths
RADARR_CMOVIES_ROOT_FOLDER_HINT=cmovies  # Substring to match in Radarr root folder paths
DEFAULT_QUALITY_PROFILE_HINT=1080  # Substring to match in quality profile names
```

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (TMDB API is stable; Brave pricing may change)

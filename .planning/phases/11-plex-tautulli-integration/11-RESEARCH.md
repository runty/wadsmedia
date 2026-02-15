# Phase 11: Plex + Tautulli Integration - Research

**Researched:** 2026-02-14
**Domain:** Plex Media Server API + Tautulli monitoring API integration for library awareness and watch history
**Confidence:** MEDIUM-HIGH

## Summary

Phase 11 adds two read-only API integrations: a Plex client for library awareness (checking if media exists, viewing season/episode availability) and a Tautulli client for watch history queries. These clients follow the established zero-dependency pattern used by TmdbClient and BraveSearchClient -- thin wrappers around native `fetch()` with Zod schema validation.

The Plex API is structurally different from all other APIs in the codebase: it defaults to XML (requiring an explicit `Accept: application/json` header), wraps all responses in a `MediaContainer` object, uses `X-Plex-Token` header auth, and requires additional client identification headers. The Tautulli API is simpler: single-endpoint query-parameter API where all commands go to `/api/v2?apikey={key}&cmd={command}`, always returns HTTP 200 (errors are in the response body), and wraps all data in `{ response: { data, result, message } }`.

The critical implementation challenge is the Plex library cache. Plex has no endpoint to search by TMDB/TVDB ID directly -- a forum thread confirms this is a known gap. The workaround is to fetch all library items with `includeGuids=1` at startup, parse the GUID entries (format: `tmdb://12345`, `tvdb://67890`, `imdb://tt1234567`), and build an in-memory Map keyed by external ID. This cache enables O(1) lookup when search tools return results, avoiding per-search API latency.

**Primary recommendation:** Build two thin API clients (`PlexClient`, `TautulliClient`) following the `BraveSearchClient` pattern. Add two new LLM tools (`check_plex_library`, `get_watch_history`). This brings the total tool count from 12 to 14, safely under the 15-tool target.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native `fetch()` | Built-in | HTTP client for Plex and Tautulli APIs | Zero-dependency approach matches existing TmdbClient, BraveSearchClient pattern. Both APIs are simple REST. |
| Zod | ^4.3.6 (existing) | Response schema validation | Already used for all API response validation in the project. Catches Plex response format changes at parse time rather than runtime errors. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| No new dependencies | N/A | N/A | Phase 11 requires zero new npm packages. All integration is via native fetch + existing Zod. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `fetch()` for Plex | `@ctrl/plex` v4.0.0 | Introduces `ofetch` dependency, inconsistent with project pattern. Only if Plex API surface grows beyond read-only library queries. |
| Native `fetch()` for Plex | `@lukehagar/plexjs` | Over-engineered TypeScript SDK. Has WebSocket support for real-time events, useful if live session monitoring is added later. |
| Native `fetch()` for Tautulli | `tautulli-api` v1.0.2 | Abandoned (7+ years stale), no TypeScript, no ESM. Never use. |
| In-memory library cache | SQLite cache table | Adds schema complexity. In-memory Map is fine for libraries under 50k items (negligible memory). Only consider if multiple WadsMedia instances share a DB. |

**Installation:**
```bash
# No new packages to install
```

## Architecture Patterns

### Recommended Project Structure

```
src/media/plex/
  plex.client.ts       # PlexClient class with library cache + search + season/episode methods
  plex.http.ts          # Plex-specific HTTP helper (handles MediaContainer, auth headers)
  plex.schemas.ts       # Zod schemas for Plex JSON responses
  plex.types.ts         # TypeScript types inferred from schemas

src/media/tautulli/
  tautulli.client.ts    # TautulliClient class
  tautulli.http.ts      # Tautulli-specific HTTP helper (handles response.result wrapper)
  tautulli.schemas.ts   # Zod schemas for Tautulli responses
  tautulli.types.ts     # TypeScript types inferred from schemas

src/plugins/
  plex.ts               # Fastify plugin: creates PlexClient, loads library cache, decorates fastify.plex
  tautulli.ts           # Fastify plugin: creates TautulliClient, decorates fastify.tautulli

src/conversation/tools/
  check-plex-library.ts # LLM tool: check if media exists in Plex, show season/episode availability
  get-watch-history.ts  # LLM tool: get user's watch history from Tautulli
```

### Pattern 1: Plex HTTP Helper (`plex.http.ts`)

**What:** A request function that handles Plex's unique auth headers, JSON response request, and MediaContainer unwrapping.
**When to use:** All Plex API requests.
**Why needed:** Plex API differs from every other API in the codebase: XML default (need `Accept: application/json`), token in header (not query param like Tautulli, not Bearer like TMDB), requires client identification headers, and wraps all responses in `MediaContainer`.

```typescript
// Source: Plex developer docs + Plexopedia community docs
import type { z } from "zod";
import { ConnectionError, MediaServerError, ValidationError } from "../errors.js";

export interface PlexRequestOptions {
  baseUrl: string;
  token: string;
  path: string;
  query?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}

const PLEX_CLIENT_ID = "wadsmedia";
const PLEX_PRODUCT = "WadsMedia";
const PLEX_VERSION = "2.0.0";

/**
 * Perform a GET request to the Plex Media Server API.
 *
 * - Uses X-Plex-Token header for authentication
 * - Sends Accept: application/json to get JSON (Plex defaults to XML)
 * - Sends required client identification headers
 * - Validates response against a Zod schema
 */
export async function plexRequest<T>(
  options: PlexRequestOptions,
  schema: z.ZodType<T>,
): Promise<T> {
  const { baseUrl, token, path, query, timeoutMs = 15_000 } = options;

  const url = new URL(path, baseUrl);
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
        "X-Plex-Token": token,
        "Accept": "application/json",
        "X-Plex-Client-Identifier": PLEX_CLIENT_ID,
        "X-Plex-Product": PLEX_PRODUCT,
        "X-Plex-Version": PLEX_VERSION,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: unknown) {
    if (err instanceof TypeError) {
      throw new ConnectionError("Plex server is unreachable.");
    }
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ConnectionError("Plex server did not respond within the timeout period.");
    }
    throw err;
  }

  if (response.status === 401) {
    throw new MediaServerError(401, "Plex authentication failed. Check X-Plex-Token.");
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

### Pattern 2: Tautulli HTTP Helper (`tautulli.http.ts`)

**What:** A request function that handles Tautulli's single-endpoint API with `cmd` parameter, `apikey` query param auth, and `response.result` wrapper.
**When to use:** All Tautulli API requests.
**Why needed:** Tautulli always returns HTTP 200, even on errors. The actual success/failure is in `response.result` ("success" or "error") and error details in `response.message`. Must check this wrapper before returning data.

```typescript
// Source: Tautulli official API reference (docs.tautulli.com)
import type { z } from "zod";
import { ConnectionError, MediaServerError, ValidationError } from "../errors.js";

export interface TautulliRequestOptions {
  baseUrl: string;
  apiKey: string;
  cmd: string;
  params?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}

/** Tautulli response wrapper -- all responses share this structure. */
const TautulliResponseWrapper = z.object({
  response: z.object({
    result: z.string(),
    message: z.string().nullable().optional(),
    data: z.unknown(),
  }),
});

/**
 * Perform an API request to Tautulli.
 *
 * - Uses apikey query parameter for authentication
 * - All commands go to /api/v2 with cmd parameter
 * - Always returns HTTP 200 -- errors are in response.result
 * - Validates the data payload against the provided Zod schema
 */
export async function tautulliRequest<T>(
  options: TautulliRequestOptions,
  schema: z.ZodType<T>,
): Promise<T> {
  const { baseUrl, apiKey, cmd, params, timeoutMs = 10_000 } = options;

  const url = new URL("/api/v2", baseUrl);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("cmd", cmd);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: unknown) {
    if (err instanceof TypeError) {
      throw new ConnectionError("Tautulli is unreachable.");
    }
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ConnectionError("Tautulli did not respond within the timeout period.");
    }
    throw err;
  }

  // Tautulli ALWAYS returns 200, but check anyway for proxy/network errors
  if (!response.ok) {
    throw new MediaServerError(response.status, await response.text());
  }

  const json: unknown = await response.json();

  // Validate the wrapper
  const wrapper = TautulliResponseWrapper.safeParse(json);
  if (!wrapper.success) {
    throw new ValidationError(`tautulli/${cmd}`, wrapper.error);
  }

  // Check Tautulli-level result
  if (wrapper.data.response.result !== "success") {
    throw new MediaServerError(
      200,
      `Tautulli command '${cmd}' failed: ${wrapper.data.response.message ?? "unknown error"}`,
    );
  }

  // Validate the data payload
  const dataResult = schema.safeParse(wrapper.data.response.data);
  if (!dataResult.success) {
    throw new ValidationError(`tautulli/${cmd}`, dataResult.error);
  }
  return dataResult.data;
}
```

### Pattern 3: Plex Library Cache with GUID Indexing

**What:** Full library scan at startup with periodic refresh. In-memory Map keyed by external IDs (tmdb://, tvdb://, imdb://) for O(1) lookup.
**When to use:** PlexClient initialization and the `check_plex_library` tool.
**Why critical:** Plex has NO endpoint to search by TMDB/TVDB ID directly (confirmed via Plex forum). The only way to check "do I have this movie by TMDB ID 12345?" is to pre-scan the library with `includeGuids=1` and build a lookup map.

```typescript
// Plex GUID parsing
// Source: Plex forum discussion + Plexopedia API docs
//
// Plex GUIDs come in two formats:
//   Legacy agent: "com.plexapp.agents.imdb://tt0103639?lang=en"
//   New agent:    "imdb://tt0103639" / "tmdb://12345" / "tvdb://67890"
//
// The Guid array (when includeGuids=1) always uses the new format.
// The main `guid` attribute on the item may use either format.

interface PlexGuidEntry {
  id: string; // e.g., "tmdb://12345" or "imdb://tt0103639"
}

function parseGuidEntries(guids: PlexGuidEntry[]): Map<string, string> {
  // Returns map of "tmdb" -> "12345", "tvdb" -> "67890", etc.
  const result = new Map<string, string>();
  for (const guid of guids) {
    const match = guid.id.match(/^(\w+):\/\/(.+)$/);
    if (match) {
      result.set(match[1], match[2]);  // provider -> id
    }
  }
  return result;
}
```

**Cache lifecycle:**
1. **Startup:** Fetch all library sections via `GET /library/sections`. For each section of type "movie" or "show", fetch all items via `GET /library/sections/{id}/all?includeGuids=1`. Parse GUIDs. Build `Map<string, PlexLibraryItem>` keyed by `"tmdb:{id}"` and `"tvdb:{id}"`.
2. **Periodic refresh:** `setInterval` every 10-15 minutes. Re-fetch all sections. Replace the Map atomically (build new Map, then swap reference).
3. **On-demand refresh:** After add_movie/add_series succeeds, optionally trigger a cache refresh (or wait for next periodic refresh -- media won't appear in Plex instantly anyway since download + import takes time).

**Memory footprint estimate:** Each cache entry stores ~200 bytes (ratingKey, title, year, type, guids). A 10,000-item library = ~2MB. Negligible.

### Pattern 4: TV Show Season/Episode Availability Drill-Down

**What:** When user asks about a TV show's availability, drill from show -> seasons -> episode counts.
**When to use:** The `check_plex_library` tool when type is "show" and the show is found in cache.

```typescript
// Plex children endpoint traversal
// Source: Plexopedia + plexapi.dev

// Step 1: Find show in cache by TVDB ID -> get ratingKey
// Step 2: GET /library/metadata/{ratingKey}/children -> seasons
// Step 3: For each season, the response includes:
//   - leafCount (total episodes in season)
//   - viewedLeafCount (watched episodes)
//   - seasonNumber (which season)
//
// This gives us "You have seasons 1-4 (40 episodes), missing season 5"
// WITHOUT needing to drill into individual episodes

// Only drill into individual episodes if the user asks about specific episodes
// e.g., "which episodes of season 3 am I missing?"
// GET /library/metadata/{seasonRatingKey}/children -> episodes
```

**Pagination note:** The `/children` endpoint supports pagination via `X-Plex-Container-Size` and `X-Plex-Container-Start` query parameters. For shows with many seasons (>50), paginate. For typical TV (1-20 seasons), no pagination needed.

### Anti-Patterns to Avoid

- **Anti-pattern: Calling Plex API on every search.** Every `search_movies` or `search_series` call would add 1-3 seconds of latency. Use the in-memory cache instead. Cache lookup is O(1).
- **Anti-pattern: Separate `check_plex_movie` and `check_plex_show` tools.** This wastes tool slots. A single `check_plex_library` tool with a `type` parameter handles both movies and shows. The tool knows the semantics: for movies, return exists/missing; for shows, drill into seasons.
- **Anti-pattern: Making Tautulli calls per-message without caching.** If a user asks "what am I watching?" and the tool makes 3 synchronous Tautulli calls, latency adds up. Cache Tautulli activity data with a 30-second TTL for frequently accessed data like current activity.
- **Anti-pattern: Passing the full Plex library to the LLM.** The library could have thousands of items. Only pass the specific lookup result (found/not found, season details) to the LLM, never the full cache.
- **Anti-pattern: Using the Plex `/hubs/search` endpoint for library existence checks.** The search endpoint is text-based title matching, not ID-based. It can return false negatives for titles with different formatting. Always use the GUID-indexed cache for existence checks by TMDB/TVDB ID.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GUID format parsing | Complex regex parser handling all Plex agent formats | Simple `match(/^(\w+):\/\/(.+)$/)` on the `Guid[].id` field | When `includeGuids=1`, Plex always returns clean format (`tmdb://12345`). Only the main `guid` attribute uses legacy `com.plexapp.agents.` format. Parse `Guid[]` entries, not the main `guid`. |
| Tautulli response error handling | Manual JSON parsing with try/catch for every endpoint | The `tautulliRequest` helper above with Zod wrapper validation | Tautulli always returns HTTP 200. Centralize the `result !== "success"` check in one place. |
| Library cache invalidation | Complex event-driven invalidation with webhooks | Simple timer-based refresh (10-15 min) | Plex library changes are infrequent. Timer refresh is simple and sufficient. The Plex API has no webhook/event system for library changes accessible to third parties. |
| Season/episode completeness formatting | Custom string builder for "seasons 1-4, missing 5" | Let the LLM format the structured data | Return `{ seasons: [{ number: 1, episodeCount: 10, available: true }, ...] }` to the LLM. It naturally formats "You have seasons 1-3, missing season 4" from structured data. |

**Key insight:** Both Plex and Tautulli are read-only integrations for WadsMedia. No writes to either service. This dramatically simplifies the client: no POST/PUT/DELETE, no request body serialization, no optimistic updates, no conflict resolution.

## Common Pitfalls

### Pitfall 1: Plex Returns XML When Accept Header is Missing

**What goes wrong:** Plex defaults to XML for all responses. If the `Accept: application/json` header is missing or misspelled, the response is XML that `response.json()` cannot parse, throwing a cryptic `SyntaxError: Unexpected token '<'` error.
**Why it happens:** Every other API in the codebase returns JSON by default. Developers copy the fetch pattern from TmdbClient or BraveSearchClient without the explicit Accept header, and it "works" in the sense that the HTTP request succeeds, but parsing fails.
**How to avoid:** The `plexRequest` helper hardcodes `Accept: application/json` in every request. Never bypass the helper for direct fetch calls. Include a validation check that the response Content-Type contains "json" before parsing.
**Warning signs:** `SyntaxError: Unexpected token '<'` in response parsing. Response body starts with `<?xml`.

### Pitfall 2: Tautulli Always Returns HTTP 200 -- Even on Errors

**What goes wrong:** A Tautulli request with an invalid command, bad parameters, or expired API key returns `HTTP 200` with `{ "response": { "result": "error", "message": "Invalid apikey" } }`. Code that only checks `response.ok` will treat this as success and try to use `null` or `undefined` data.
**Why it happens:** Tautulli's API convention is to embed error information in the response body rather than using HTTP status codes. This is unconventional but documented.
**How to avoid:** The `tautulliRequest` helper validates `response.result === "success"` after HTTP status check. If result is not "success", throw `MediaServerError` with the Tautulli error message. Never skip this wrapper validation.
**Warning signs:** Tool returns `null` or empty data without errors being logged. Tautulli API key is wrong but no errors appear.

### Pitfall 3: Plex Token Expiry (JWT Transition)

**What goes wrong:** Plex transitioned to JWT authentication in 2025. Classic long-lived tokens from account settings may expire (JWTs are valid ~7 days). WadsMedia works for a week after configuration, then Plex integration silently starts returning 401 errors.
**Why it happens:** The static `PLEX_TOKEN` env var pattern used by Sonarr/Radarr (which use permanent API keys) creates a false expectation that Plex tokens are also permanent. They are not, especially for remote access tokens.
**How to avoid:** For homelab deployments (WadsMedia and Plex on the same Docker network), use the server's local token from `Preferences.xml`. This token does NOT expire for local access. Document this clearly in setup instructions. Add a health check on startup and periodically (every 30 minutes) that calls `GET /` with the token to verify authentication still works. Log a warning when Plex auth fails so the admin knows to rotate the token.
**Warning signs:** Plex integration works initially, then returns empty results or errors after several days. 401 responses from Plex API.

### Pitfall 4: Plex GUID Array Missing When `includeGuids` Not Set

**What goes wrong:** The GUID entries (tmdb://, tvdb://, imdb://) are ONLY present when `includeGuids=1` is passed as a query parameter. Without it, only the main `guid` attribute is present (which uses the legacy agent format like `com.plexapp.agents.imdb://tt0103639?lang=en` and is harder to parse).
**Why it happens:** Including GUIDs for every item increases response size. Plex makes it opt-in.
**How to avoid:** Always pass `includeGuids=1` when fetching library items for the cache. The `Guid` array format is consistent: `[{ id: "tmdb://12345" }, { id: "imdb://tt0103639" }]`.
**Warning signs:** Library items found in Plex but not matched by TMDB/TVDB ID. Cache Map is empty despite library having items.

### Pitfall 5: Plex Library Sections Have Different Types

**What goes wrong:** `GET /library/sections` returns all library types: movies, shows, music, photos, other. Fetching all items from a music section and trying to parse movie metadata fails.
**Why it happens:** Developers iterate all sections without checking the `type` attribute.
**How to avoid:** Filter sections by `type === "movie"` or `type === "show"` before fetching items. Plex uses these type strings: `movie`, `show`, `artist` (music), `photo`, `mixed`.
**Warning signs:** Schema validation errors on library items. Unexpected `artist` or `photo` items in the cache.

### Pitfall 6: Tautulli User IDs vs Plex User IDs

**What goes wrong:** Tautulli's `user_id` in `get_history` and `get_users` is Tautulli's internal row ID for the user, which MAY differ from the Plex account ID. If you link a WadsMedia user to a Plex user ID obtained from the Plex API, that ID may not match Tautulli's `user_id`.
**Why it happens:** Tautulli maintains its own user table synced from Plex. The `user_id` field in Tautulli's `get_users` response corresponds to Tautulli's representation.
**How to avoid:** Use Tautulli's `get_users` endpoint as the source of truth for user IDs when querying Tautulli history. Match by `username` or `friendly_name` rather than numeric ID if linking across systems. For Phase 11 (before Phase 12 user linking), fall back to global history (no user filtering). When Phase 12 adds user linking, store the Tautulli `user_id` from `get_users`, not the Plex account ID.
**Warning signs:** Watch history returns for wrong user. User ID passed to `get_history` returns empty results despite the user having watch activity.

### Pitfall 7: Large Plex Libraries and Initial Cache Load Time

**What goes wrong:** A Plex library with 10,000+ movies and 1,000+ TV shows takes 5-10 seconds to fetch with `includeGuids=1`. During this time, the WadsMedia server is starting up and cannot respond to webhooks.
**Why it happens:** The `includeGuids=1` parameter adds GUID data to every item, increasing response size significantly. Each library section is a separate API call.
**How to avoid:** Load the cache asynchronously after server startup. The server can accept webhooks immediately; Plex checks will simply return "Plex library not yet loaded" until the cache is ready. Use `Promise.allSettled` to load all sections concurrently. Log cache load timing for monitoring.
**Warning signs:** Slow startup times. First few user queries after restart show "Plex unavailable" even though Plex is running.

## Code Examples

### PlexClient Core Methods

```typescript
// Source: Combined from Plex API docs, Plexopedia, plexapi.dev
export class PlexClient {
  private readonly baseUrl: string;
  private readonly token: string;

  /** In-memory library cache: "tmdb:12345" -> PlexLibraryItem */
  private libraryCache = new Map<string, PlexLibraryItem>();
  /** Section metadata (id, title, type) */
  private sections: PlexLibrarySection[] = [];
  /** Cache loading state */
  private cacheReady = false;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  /** Load all library sections and build the GUID-indexed cache. */
  async loadLibraryCache(): Promise<void> {
    // Step 1: Fetch all sections
    const sectionsResponse = await plexRequest(
      { baseUrl: this.baseUrl, token: this.token, path: "/library/sections" },
      PlexSectionsResponseSchema,
    );
    this.sections = sectionsResponse.MediaContainer.Directory;

    // Step 2: For each movie/show section, fetch all items with GUIDs
    const newCache = new Map<string, PlexLibraryItem>();

    const mediaSections = this.sections.filter(
      (s) => s.type === "movie" || s.type === "show",
    );

    const fetchPromises = mediaSections.map(async (section) => {
      const items = await plexRequest(
        {
          baseUrl: this.baseUrl,
          token: this.token,
          path: `/library/sections/${section.key}/all`,
          query: { includeGuids: 1 },
          timeoutMs: 30_000, // Large libraries need more time
        },
        PlexLibraryItemsResponseSchema,
      );

      for (const item of items.MediaContainer.Metadata ?? []) {
        const entry: PlexLibraryItem = {
          ratingKey: item.ratingKey,
          title: item.title,
          year: item.year,
          type: section.type as "movie" | "show",
          sectionTitle: section.title,
          leafCount: item.leafCount,        // episodes (for shows)
          viewedLeafCount: item.viewedLeafCount, // watched episodes
        };

        // Index by each GUID provider
        for (const guid of item.Guid ?? []) {
          const match = guid.id.match(/^(\w+):\/\/(.+)$/);
          if (match) {
            newCache.set(`${match[1]}:${match[2]}`, entry);
          }
        }
      }
    });

    await Promise.allSettled(fetchPromises);
    this.libraryCache = newCache;
    this.cacheReady = true;
  }

  /** Check if media exists by TMDB ID. */
  findByTmdbId(tmdbId: number): PlexLibraryItem | undefined {
    return this.libraryCache.get(`tmdb:${tmdbId}`);
  }

  /** Check if media exists by TVDB ID. */
  findByTvdbId(tvdbId: number): PlexLibraryItem | undefined {
    return this.libraryCache.get(`tvdb:${tvdbId}`);
  }

  /** Get season/episode availability for a TV show. */
  async getShowAvailability(ratingKey: string): Promise<SeasonAvailability[]> {
    const response = await plexRequest(
      {
        baseUrl: this.baseUrl,
        token: this.token,
        path: `/library/metadata/${ratingKey}/children`,
      },
      PlexChildrenResponseSchema,
    );

    return (response.MediaContainer.Metadata ?? []).map((season) => ({
      seasonNumber: season.index,           // Season number
      episodeCount: season.leafCount,       // Total episodes
      viewedCount: season.viewedLeafCount,  // Watched episodes
      title: season.title,
    }));
  }

  /** Verify Plex is reachable and token is valid. */
  async healthCheck(): Promise<boolean> {
    try {
      await plexRequest(
        { baseUrl: this.baseUrl, token: this.token, path: "/" },
        z.object({ MediaContainer: z.object({}).passthrough() }),
      );
      return true;
    } catch {
      return false;
    }
  }

  get isCacheReady(): boolean {
    return this.cacheReady;
  }

  get cacheSize(): number {
    return this.libraryCache.size;
  }
}
```

### TautulliClient Core Methods

```typescript
// Source: Tautulli API reference (docs.tautulli.com)
export class TautulliClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  /** Get watch history, optionally filtered by user. */
  async getHistory(opts?: {
    userId?: number;
    mediaType?: "movie" | "episode";
    length?: number;
    startDate?: string; // YYYY-MM-DD
  }): Promise<TautulliHistoryData> {
    const params: Record<string, string | number | boolean> = {};
    if (opts?.userId) params.user_id = opts.userId;
    if (opts?.mediaType) params.media_type = opts.mediaType;
    if (opts?.length) params.length = opts.length;
    if (opts?.startDate) params.start_date = opts.startDate;

    return tautulliRequest(
      { baseUrl: this.baseUrl, apiKey: this.apiKey, cmd: "get_history", params },
      TautulliHistoryDataSchema,
    );
  }

  /** Get all Plex users known to Tautulli. */
  async getUsers(): Promise<TautulliUser[]> {
    return tautulliRequest(
      { baseUrl: this.baseUrl, apiKey: this.apiKey, cmd: "get_users" },
      z.array(TautulliUserSchema),
    );
  }

  /** Get watch time stats for a specific user. */
  async getUserWatchTimeStats(userId: number): Promise<TautulliWatchTimeStat[]> {
    return tautulliRequest(
      {
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        cmd: "get_user_watch_time_stats",
        params: { user_id: userId, query_days: "7,30,0" },
      },
      z.array(TautulliWatchTimeStatSchema),
    );
  }

  /** Verify Tautulli is reachable and API key is valid. */
  async healthCheck(): Promise<boolean> {
    try {
      await tautulliRequest(
        { baseUrl: this.baseUrl, apiKey: this.apiKey, cmd: "arnold" },
        z.unknown(),
      );
      return true;
    } catch {
      return false;
    }
  }
}
```

### Plex Fastify Plugin

```typescript
// Source: Pattern from existing plugins/tmdb.ts and plugins/brave.ts
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { PlexClient } from "../media/plex/plex.client.js";

declare module "fastify" {
  interface FastifyInstance {
    plex?: PlexClient;
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    const { PLEX_URL, PLEX_TOKEN } = fastify.config;

    if (!PLEX_URL || !PLEX_TOKEN) {
      fastify.log.warn("Plex not configured (set PLEX_URL and PLEX_TOKEN), library checks unavailable");
      return;
    }

    const client = new PlexClient(PLEX_URL, PLEX_TOKEN);

    // Health check first
    const healthy = await client.healthCheck();
    if (!healthy) {
      fastify.log.error("Plex server is unreachable or token is invalid, skipping library cache");
      fastify.decorate("plex", client);
      return;
    }

    // Load library cache asynchronously (don't block server startup)
    client.loadLibraryCache()
      .then(() => {
        fastify.log.info(
          { cacheSize: client.cacheSize },
          "Plex library cache loaded",
        );
      })
      .catch((err) => {
        fastify.log.error({ err }, "Failed to load Plex library cache on startup");
      });

    // Periodic cache refresh (every 15 minutes)
    const refreshInterval = setInterval(() => {
      client.loadLibraryCache().catch((err) => {
        fastify.log.error({ err }, "Plex library cache refresh failed");
      });
    }, 15 * 60 * 1000);

    // Periodic health check (every 30 minutes)
    const healthInterval = setInterval(async () => {
      const ok = await client.healthCheck();
      if (!ok) {
        fastify.log.warn("Plex health check failed -- token may have expired");
      }
    }, 30 * 60 * 1000);

    // Clean up intervals on server close
    fastify.addHook("onClose", () => {
      clearInterval(refreshInterval);
      clearInterval(healthInterval);
    });

    fastify.decorate("plex", client);
    fastify.log.info("Plex client configured, library cache loading...");
  },
  { name: "plex", dependencies: ["database"] },
);
```

### check_plex_library Tool

```typescript
// Source: Tool pattern from existing search-movies.ts, search-series.ts
import { z } from "zod";
import { defineTool } from "../tools.js";

export const checkPlexLibraryTool = defineTool(
  "check_plex_library",
  "Check if a movie or TV show exists in the user's Plex library. For TV shows, shows which seasons and episodes are available. Use when the user asks 'do I have...', 'is ... in my library', 'what seasons of ... do I have', or before suggesting the user add something they might already have.",
  z.object({
    title: z.string().describe("The title to search for"),
    type: z.enum(["movie", "show"]).describe("Whether to check for a movie or TV show"),
    tmdbId: z.number().optional().describe("TMDB ID for precise matching (for movies)"),
    tvdbId: z.number().optional().describe("TVDB ID for precise matching (for TV shows)"),
  }),
  "safe",
  async (args, context) => {
    if (!context.plex) {
      return { error: "Plex is not configured" };
    }

    if (!context.plex.isCacheReady) {
      return { error: "Plex library cache is still loading. Try again in a moment." };
    }

    // Try ID-based lookup first (most reliable)
    let item;
    if (args.type === "movie" && args.tmdbId) {
      item = context.plex.findByTmdbId(args.tmdbId);
    } else if (args.type === "show" && args.tvdbId) {
      item = context.plex.findByTvdbId(args.tvdbId);
    }

    if (!item) {
      return {
        found: false,
        title: args.title,
        type: args.type,
        message: `${args.title} was not found in your Plex library`,
      };
    }

    // For movies: simple exists check
    if (args.type === "movie") {
      return {
        found: true,
        title: item.title,
        year: item.year,
        type: "movie",
        library: item.sectionTitle,
        message: `${item.title} (${item.year}) is in your Plex library`,
      };
    }

    // For shows: drill into season/episode availability
    try {
      const seasons = await context.plex.getShowAvailability(item.ratingKey);
      const availableSeasons = seasons.filter((s) => s.episodeCount > 0 && s.seasonNumber > 0);

      return {
        found: true,
        title: item.title,
        year: item.year,
        type: "show",
        library: item.sectionTitle,
        seasons: availableSeasons.map((s) => ({
          season: s.seasonNumber,
          episodes: s.episodeCount,
          watched: s.viewedCount ?? 0,
        })),
        totalSeasons: availableSeasons.length,
        totalEpisodes: availableSeasons.reduce((sum, s) => sum + s.episodeCount, 0),
      };
    } catch {
      // Season data fetch failed, return basic availability
      return {
        found: true,
        title: item.title,
        year: item.year,
        type: "show",
        library: item.sectionTitle,
        message: `${item.title} is in your Plex library (season details unavailable)`,
      };
    }
  },
);
```

### get_watch_history Tool

```typescript
// Source: Tool pattern from existing tools + Tautulli API reference
import { z } from "zod";
import { defineTool } from "../tools.js";

export const getWatchHistoryTool = defineTool(
  "get_watch_history",
  "Get the user's recent watch history from Tautulli/Plex. Shows what has been watched recently, including title, date, and duration. Use when the user asks 'what have I been watching', 'what did I watch recently', or 'my watch history'.",
  z.object({
    mediaType: z
      .enum(["movie", "episode"])
      .optional()
      .describe("Filter by media type: movie or episode (TV). Omit for all types."),
    limit: z
      .number()
      .min(1)
      .max(25)
      .default(10)
      .optional()
      .describe("Number of recent items to return (default 10, max 25)"),
  }),
  "safe",
  async (args, context) => {
    if (!context.tautulli) {
      return { error: "Tautulli is not configured" };
    }

    // Phase 11: Use global history (no per-user filtering)
    // Phase 12 will add user linking and pass userId for per-user history
    const history = await context.tautulli.getHistory({
      mediaType: args.mediaType,
      length: args.limit ?? 10,
    });

    if (!history.data || history.data.length === 0) {
      return { results: [], message: "No recent watch history found" };
    }

    const results = history.data.map((entry) => ({
      title: entry.full_title,
      mediaType: entry.media_type,
      watchedDate: entry.date,
      duration: entry.duration,
      user: entry.friendly_name,
      platform: entry.platform,
      player: entry.player,
      percentComplete: entry.percent_complete,
    }));

    return { results };
  },
);
```

### Zod Schemas for Plex Responses

```typescript
// Plex response schemas -- all responses wrap in MediaContainer
import { z } from "zod";

/** GUID entry from includeGuids=1 */
export const PlexGuidSchema = z.object({
  id: z.string(), // e.g., "tmdb://12345", "tvdb://67890", "imdb://tt0103639"
});

/** Library section (from /library/sections) */
export const PlexSectionSchema = z.object({
  key: z.string(),           // Section ID (used in URL paths)
  title: z.string(),         // "Movies", "TV Shows", "Anime", etc.
  type: z.string(),          // "movie", "show", "artist", "photo"
  agent: z.string().optional(),
  scanner: z.string().optional(),
}).passthrough();

export const PlexSectionsResponseSchema = z.object({
  MediaContainer: z.object({
    Directory: z.array(PlexSectionSchema),
  }).passthrough(),
});

/** Library item (movie or show from /library/sections/{id}/all) */
export const PlexLibraryItemSchema = z.object({
  ratingKey: z.string(),       // Plex internal ID (used for /metadata/{id}/children)
  title: z.string(),
  year: z.number().optional(),
  type: z.string().optional(), // "movie" or "show"
  leafCount: z.number().optional(),       // Total episodes (shows only)
  viewedLeafCount: z.number().optional(), // Watched episodes (shows only)
  Guid: z.array(PlexGuidSchema).optional(), // Only present with includeGuids=1
}).passthrough();

export const PlexLibraryItemsResponseSchema = z.object({
  MediaContainer: z.object({
    Metadata: z.array(PlexLibraryItemSchema).optional(),
    size: z.number().optional(),
  }).passthrough(),
});

/** Season/episode children (from /library/metadata/{id}/children) */
export const PlexChildItemSchema = z.object({
  ratingKey: z.string(),
  title: z.string(),                       // "Season 1", "Episode Title"
  index: z.number().optional(),            // Season number or episode number
  leafCount: z.number().optional(),        // Total episodes (for seasons)
  viewedLeafCount: z.number().optional(),  // Watched episodes (for seasons)
  type: z.string().optional(),             // "season" or "episode"
}).passthrough();

export const PlexChildrenResponseSchema = z.object({
  MediaContainer: z.object({
    Metadata: z.array(PlexChildItemSchema).optional(),
    size: z.number().optional(),
  }).passthrough(),
});
```

### Zod Schemas for Tautulli Responses

```typescript
// Tautulli response schemas
import { z } from "zod";

/** History item from get_history */
export const TautulliHistoryItemSchema = z.object({
  date: z.number(),                                    // Unix timestamp
  duration: z.number(),                                // Seconds
  friendly_name: z.string(),                           // Plex username
  full_title: z.string(),                              // "Show - S01E01 - Title" or "Movie Title"
  grandparent_rating_key: z.number().optional(),       // Show-level rating key
  media_type: z.string(),                              // "movie", "episode"
  platform: z.string(),                                // "Chrome", "Roku", etc.
  player: z.string(),                                  // Player name
  rating_key: z.number(),                              // Item rating key
  started: z.number(),                                 // Unix timestamp
  stopped: z.number(),                                 // Unix timestamp
  title: z.string(),                                   // Episode/movie title
  user: z.string().optional(),                         // Username
  user_id: z.number().optional(),                      // Tautulli user ID
  watched_status: z.number().optional(),               // 0 = unwatched, 1 = watched
  percent_complete: z.number().optional(),             // 0-100
  transcode_decision: z.string().optional(),           // "direct play", "transcode"
  ip_address: z.string().optional(),
}).passthrough();

export const TautulliHistoryDataSchema = z.object({
  recordsFiltered: z.number(),
  recordsTotal: z.number(),
  data: z.array(TautulliHistoryItemSchema),
  draw: z.number().optional(),
  filter_duration: z.string().optional(),
  total_duration: z.string().optional(),
});

/** User from get_users */
export const TautulliUserSchema = z.object({
  user_id: z.number(),
  username: z.string(),
  friendly_name: z.string(),
  email: z.string().optional(),
  is_active: z.number(),         // 1 or 0
  is_admin: z.number().optional(), // 1 or 0
  thumb: z.string().optional(),
  shared_libraries: z.string().optional(), // Comma-separated section IDs
}).passthrough();

/** Watch time stat from get_user_watch_time_stats */
export const TautulliWatchTimeStatSchema = z.object({
  query_days: z.number(),     // 1, 7, 30, or 0 (all time)
  total_plays: z.number(),
  total_time: z.number(),     // Seconds
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Plex classic long-lived tokens | JWT tokens (7-day expiry) | 2025 | Use local server token for homelab (no expiry); document JWT flow for remote access |
| Plex XML default response | JSON via Accept header | Always available, but XML remains default | Must always send `Accept: application/json` |
| Plex legacy agent GUIDs (`com.plexapp.agents.imdb://...`) | New agent GUIDs (`imdb://...`, `tmdb://...`) | 2020+ (Plex new agents) | Use `includeGuids=1` query param to get clean format; parse `Guid[]` array, not main `guid` attribute |
| Tautulli npm package (`tautulli-api` v1.0.2) | Build custom client with native fetch | Package abandoned 7+ years ago | Zero-dependency client with Zod schemas |

**Deprecated/outdated:**
- `node-plex-api` npm package: Last updated 7+ years ago. Does not support JSON responses properly. Do not use.
- `tautulli-api` npm package: v1.0.2 from 2018. No TypeScript, no ESM. Do not use.
- Plex `com.plexapp.agents.*` GUID format: Still returned in the main `guid` attribute for legacy reasons, but the `Guid[]` array (via `includeGuids=1`) uses the clean `provider://id` format.

## Open Questions

1. **Plex `includeGuids` on large libraries -- pagination behavior**
   - What we know: `includeGuids=1` works and returns GUID entries for each item. Pagination is supported via `X-Plex-Container-Start` and `X-Plex-Container-Size`.
   - What's unclear: Whether Plex returns ALL items in a single response for `/library/sections/{id}/all` or silently truncates at some limit without `includeGuids`. Some community reports suggest a 50,000-item soft limit.
   - Recommendation: Implement with no pagination first (most homelab libraries are under 10,000 items). Add pagination support if cache is missing items compared to Plex's reported library size. Compare `MediaContainer.size` vs actual items received.

2. **Plex JSON response key naming consistency**
   - What we know: Plex JSON wraps everything in `MediaContainer`. Items are in `Metadata` array. Sections are in `Directory` array.
   - What's unclear: Plex v1.3+ changed some JSON key naming. The `Metadata` key name might differ between Plex versions. Plexopedia documents current format.
   - Recommendation: Use `.passthrough()` on all Zod schemas to tolerate extra fields. Validate only the fields we use. If key names differ, the Zod parse will fail cleanly at startup (not silently) and the error message will identify the issue.

3. **Tautulli user_id stability across Tautulli restarts/upgrades**
   - What we know: `get_users` returns `user_id` as a numeric identifier. This is used to filter `get_history`.
   - What's unclear: Whether `user_id` is Tautulli's internal row_id (could change if Tautulli DB is reset) or the Plex account ID (stable across restarts).
   - Recommendation: For Phase 11 (no user linking), this is not an issue -- use global history. For Phase 12 user linking, verify by comparing `get_users` output with Plex API user data. Store `username` as a fallback identifier alongside `user_id`.

4. **Season 0 (Specials) handling in Plex children response**
   - What we know: Plex stores specials as "Season 0" with `index: 0`.
   - What's unclear: Whether specials should be included in the season availability summary or excluded for clarity.
   - Recommendation: Include in API response but filter in tool output. Return seasons where `index > 0` as the primary response. Mention specials only if asked: "Also has X specials in Season 0."

## Integration Points with Existing Codebase

### Files to Modify

| File | Change | Why |
|------|--------|-----|
| `src/config.ts` | Add `PLEX_URL`, `PLEX_TOKEN`, `TAUTULLI_URL`, `TAUTULLI_API_KEY` env vars | New service configuration |
| `src/conversation/types.ts` | Add `plex?` and `tautulli?` to `ToolContext` interface | Tools need access to Plex/Tautulli clients |
| `src/conversation/engine.ts` | Add `plex` and `tautulli` to `ProcessConversationParams` interface, thread through to ToolContext | Client propagation from webhook to tools |
| `src/plugins/webhook.ts` | Pass `fastify.plex` and `fastify.tautulli` to `processConversation()` | Client injection into conversation flow |
| `src/plugins/conversation.ts` | Register `checkPlexLibraryTool` and `getWatchHistoryTool` | New tools in registry |
| `src/conversation/tools/index.ts` | Export `checkPlexLibraryTool` and `getWatchHistoryTool` | Module re-exports |
| `src/server.ts` | Register `plexPlugin` and `tautulliPlugin` | Plugin initialization |
| `src/conversation/system-prompt.ts` | Add Plex/Tautulli capability descriptions | LLM needs to know about new tools |

### Files to Create

| File | Purpose |
|------|---------|
| `src/media/plex/plex.http.ts` | Plex HTTP helper with auth headers and JSON Accept |
| `src/media/plex/plex.schemas.ts` | Zod schemas for Plex JSON responses |
| `src/media/plex/plex.types.ts` | TypeScript types inferred from schemas |
| `src/media/plex/plex.client.ts` | PlexClient class with library cache |
| `src/media/tautulli/tautulli.http.ts` | Tautulli HTTP helper with response wrapper handling |
| `src/media/tautulli/tautulli.schemas.ts` | Zod schemas for Tautulli responses |
| `src/media/tautulli/tautulli.types.ts` | TypeScript types |
| `src/media/tautulli/tautulli.client.ts` | TautulliClient class |
| `src/plugins/plex.ts` | Fastify plugin for PlexClient |
| `src/plugins/tautulli.ts` | Fastify plugin for TautulliClient |
| `src/conversation/tools/check-plex-library.ts` | LLM tool for Plex library checks |
| `src/conversation/tools/get-watch-history.ts` | LLM tool for Tautulli watch history |

### Tool Count Impact

Current tools: 12 (check_status + 11 registered in conversation.ts)
Phase 11 adds: 2 (check_plex_library, get_watch_history)
New total: 14

This is under the 15-tool target. The remaining 1 slot provides headroom for Phase 12 (user linking) which may not need a new tool at all (linking happens via dashboard, not conversation).

### System Prompt Additions

```
Plex library:
- Use check_plex_library to see if media exists in the user's Plex library.
- For TV shows, it shows which seasons and episodes are available.
- When a user searches for media, mention if it's already in their Plex library before offering to add it.
- If the user asks "do I have X?" or "what seasons of X do I have?", use check_plex_library.

Watch history:
- Use get_watch_history when the user asks what they've been watching, their recent viewing, or wants recommendations based on recent watches.
- Watch history currently shows global Plex activity (per-user filtering requires Plex user linking in Phase 12).
- Keep watch history responses concise -- list the most recent items with title and when watched.
```

## Sources

### Primary (HIGH confidence)
- [Tautulli API Reference](https://docs.tautulli.com/extending-tautulli/api-reference) -- API call format, get_history parameters, get_users response, response wrapper structure
- [Tautulli GitHub API Wiki](https://github.com/Tautulli/Tautulli/wiki/Tautulli-API-Reference) -- Detailed command documentation, parameter types, response fields
- [Plex Media Server API](https://developer.plex.tv/pms/) -- Official API documentation, authentication, endpoints
- [Plex Search Hub API](https://plexapi.dev/api-reference/search/perform-a-search) -- /hubs/search endpoint, parameters, MediaContainer response format
- [Plex Items Children](https://plexapi.dev/api-reference/library/get-items-children) -- /library/metadata/{id}/children endpoint, pagination
- Existing WadsMedia codebase analysis -- TmdbClient, BraveSearchClient, ToolContext, ToolRegistry, Fastify plugin patterns (direct file reads)

### Secondary (MEDIUM confidence)
- [Plexopedia: Get All Movies](https://www.plexopedia.com/plex-media-server/api/library/movies/) -- includeGuids parameter, response structure, GUID format
- [Plexopedia: Get All TV Shows](https://www.plexopedia.com/plex-media-server/api/library/tvshows/) -- TV show metadata, children endpoint, leafCount fields
- [Plexopedia: API Overview](https://www.plexopedia.com/plex-media-server/api/) -- Endpoint catalog, Accept header for JSON, authentication
- [Plex Forum: Search by External ID](https://forums.plex.tv/t/pms-developer-api-search-library-with-external-id-eg-imdb/934815) -- Confirms no official endpoint for external ID search; workaround via includeGuids cache
- [Plex Forum: GUID format](https://forums.plex.tv/t/implemented-native-plex-agents-allow-access-to-external-provider-ids-for-media-eg-imdb-tmdb-tvdb/619090) -- GUID entry format: `tmdb://12345`, `tvdb://67890`, `imdb://tt0103639`

### Tertiary (LOW confidence, needs validation)
- Plex JWT token expiry timeline and local token behavior -- Inferred from forum discussions; actual expiry behavior should be verified during implementation with a multi-day test
- Plex JSON response key naming across versions -- Community reports suggest naming changes in v1.3+; use `.passthrough()` on Zod schemas as safety net
- Tautulli `user_id` stability across restarts -- Assumption that it maps to Plex user ID; needs runtime verification during Phase 12

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, follows proven existing pattern
- Architecture: HIGH -- PlexClient/TautulliClient follow TmdbClient/BraveSearchClient pattern exactly; Fastify plugins follow tmdb.ts/brave.ts pattern
- Plex API specifics: MEDIUM -- official docs are sparse; community resources (Plexopedia) are the primary reference; GUID format and response structure confirmed across multiple sources but JSON field naming needs runtime verification
- Tautulli API: HIGH -- well-documented official API reference with clear parameter/response definitions
- Pitfalls: MEDIUM-HIGH -- token expiry, XML default, and response wrapper issues are well-documented; library cache pagination edge case needs runtime testing

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (30 days -- APIs are stable)

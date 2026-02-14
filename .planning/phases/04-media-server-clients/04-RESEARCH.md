# Phase 4: Media Server Clients - Research

**Researched:** 2026-02-13
**Domain:** Sonarr/Radarr REST API integration, typed HTTP clients, Zod validation
**Confidence:** HIGH

## Summary

Phase 4 builds typed API clients for Sonarr and Radarr, two media management servers that share a common ancestor (*arr stack) but have diverged enough to warrant separate client implementations. Both servers expose REST APIs at the `/api/v3/` path -- this is confirmed for current stable releases (Sonarr v4.0.16, Radarr v6.0.4). The "v3 vs v4 API" blocker from initial research is resolved: both servers use `/api/v3/` regardless of their application version.

The project already has Zod 4.3.6 installed and uses it for config validation with `safeParse`. The same pattern extends naturally to API response validation. Node.js 22 (running v25.6.1 on this machine) provides native `fetch` with `AbortSignal.timeout()` support, eliminating the need for any HTTP client library. The existing codebase uses Fastify plugins with `fastify-plugin` and decorators -- the media server clients should follow this same pattern, being registered as Fastify decorators accessible as `fastify.sonarr` and `fastify.radarr`.

**Primary recommendation:** Build two separate client classes (SonarrClient, RadarrClient) backed by a thin shared HTTP utility function (not a class), with Zod schemas defining all API response shapes, Node.js native fetch for HTTP, and Fastify plugins for lifecycle management (startup caching, graceful degradation).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native `fetch` | Node.js 22 built-in | HTTP requests | Zero dependencies, `AbortSignal.timeout()` support, stable in Node 22+ |
| `zod` | 4.3.6 (installed) | Response validation & type inference | Already in project, `z.infer<>` gives types from schemas |
| `fastify-plugin` | 5.1.0 (installed) | Plugin registration | Already in project, standard pattern for decorators |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None needed | - | - | Native fetch + Zod covers all requirements |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native fetch | `undici` (explicit) | Node 22's fetch IS undici under the hood; no benefit to importing directly |
| Native fetch | `got` / `axios` | Adds dependency for no gain; project is server-side Node 22 only |
| Hand-rolled client | `@arr-ts-2/sonarr` npm package | Auto-generated from OpenAPI, last published 1+ year ago, no Zod integration, adds stale dependency |
| Separate clients | Shared base class | Sonarr/Radarr APIs are similar but diverge in field names and semantics; shared abstraction leaks |

**Installation:**
```bash
# No new packages needed. All dependencies already installed.
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  media/
    sonarr/
      sonarr.client.ts        # SonarrClient class with all API methods
      sonarr.schemas.ts        # Zod schemas for Sonarr API responses
      sonarr.types.ts          # Inferred types exported from schemas
    radarr/
      radarr.client.ts         # RadarrClient class with all API methods
      radarr.schemas.ts        # Zod schemas for Radarr API responses
      radarr.types.ts          # Inferred types exported from schemas
    http.ts                    # Shared HTTP utility (fetch wrapper with auth, timeout, error handling)
    errors.ts                  # MediaServerError, ConnectionError, ValidationError classes
  plugins/
    sonarr.ts                  # Fastify plugin: creates client, caches profiles/folders, decorates
    radarr.ts                  # Fastify plugin: creates client, caches profiles/folders, decorates
```

### Pattern 1: Typed HTTP Utility Function
**What:** A shared async function that wraps `fetch` with API key injection, timeout, JSON parsing, and consistent error handling.
**When to use:** Every API call goes through this function.
**Example:**
```typescript
// Source: Node.js 22 native fetch + AbortSignal.timeout()
interface HttpRequestOptions {
  baseUrl: string;
  apiKey: string;
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean>;
  timeoutMs?: number;
}

async function apiRequest<T>(
  options: HttpRequestOptions,
  schema: z.ZodType<T>,
): Promise<T> {
  const { baseUrl, apiKey, path, method = "GET", body, query, timeoutMs = 10_000 } = options;

  const url = new URL(`/api/v3/${path}`, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new MediaServerError(response.status, await response.text());
  }

  // DELETE often returns 200 with empty body
  if (method === "DELETE") {
    return undefined as T;
  }

  const json: unknown = await response.json();
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ValidationError(path, result.error);
  }
  return result.data;
}
```

### Pattern 2: Client Class with Dependency Injection
**What:** Each client class takes `baseUrl` and `apiKey` as constructor params, exposes typed methods, delegates HTTP to the shared utility.
**When to use:** All Sonarr/Radarr operations.
**Example:**
```typescript
export class SonarrClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async searchSeries(term: string): Promise<SeriesLookupResult[]> {
    return apiRequest(
      { baseUrl: this.baseUrl, apiKey: this.apiKey, path: "series/lookup", query: { term } },
      z.array(SeriesLookupSchema),
    );
  }

  async addSeries(input: AddSeriesInput): Promise<Series> {
    return apiRequest(
      { baseUrl: this.baseUrl, apiKey: this.apiKey, path: "series", method: "POST", body: input },
      SeriesSchema,
    );
  }
}
```

### Pattern 3: Fastify Plugin with Startup Caching
**What:** Plugin creates client, fetches quality profiles and root folders on registration, caches them as properties on the client, and decorates Fastify.
**When to use:** Server startup.
**Example:**
```typescript
export default fp(
  async (fastify: FastifyInstance) => {
    const { SONARR_URL, SONARR_API_KEY } = fastify.config;
    if (!SONARR_URL || !SONARR_API_KEY) {
      fastify.log.warn("Sonarr not configured, client unavailable");
      return;
    }

    const client = new SonarrClient(SONARR_URL, SONARR_API_KEY);

    try {
      await client.loadCachedData(); // fetches profiles + root folders
      fastify.log.info("Sonarr client connected and cached data loaded");
    } catch (err) {
      fastify.log.error({ err }, "Sonarr unreachable on startup -- client registered in degraded mode");
      // Still register client; operations will fail individually with clear errors
    }

    fastify.decorate("sonarr", client);
  },
  { name: "sonarr" },
);
```

### Pattern 4: Graceful Degradation
**What:** When a server is unreachable, the client is still registered but individual operations return descriptive errors. The application does NOT crash.
**When to use:** Server startup and every API call.
**Example:**
```typescript
// Wrap fetch errors into user-friendly messages
function handleFetchError(err: unknown, serverName: string): never {
  if (err instanceof TypeError && (err.message.includes("fetch failed") || err.message.includes("ECONNREFUSED"))) {
    throw new ConnectionError(`${serverName} is unreachable. Check that the server is running and the URL is correct.`);
  }
  if (err instanceof DOMException && err.name === "TimeoutError") {
    throw new ConnectionError(`${serverName} did not respond within the timeout period.`);
  }
  throw err;
}
```

### Anti-Patterns to Avoid
- **Shared base class for Sonarr/Radarr:** APIs look similar but diverge in field names (`tvdbId` vs `tmdbId`, `series` vs `movie`, `seasonFolder` vs `minimumAvailability`). A shared abstraction forces awkward generics and conditional logic. Keep them separate.
- **Parsing full response objects eagerly:** Use `.passthrough()` on Zod schemas to allow unknown fields. The APIs return many fields we don't need; strict schemas break when servers add new fields in updates.
- **Throwing on startup when server unreachable:** The app should start even if Sonarr/Radarr are down. Fail at operation time with descriptive errors, not at boot.
- **Caching quality profiles forever:** Cache on startup, expose a method to refresh on demand. Profiles rarely change but users may configure them while the app is running.

## API Reference: Sonarr v3

### Authentication
- **Header:** `X-Api-Key: <key>`
- **Query:** `?apikey=<key>`
- **Base path:** `/api/v3/`
- **Default port:** 8989

### Endpoints Required for This Phase

| Method | Path | Parameters | Response |
|--------|------|------------|----------|
| GET | `/api/v3/series/lookup` | `term` (string) | `SeriesLookupResult[]` |
| GET | `/api/v3/series` | - | `Series[]` |
| POST | `/api/v3/series` | body: SeriesResource | `Series` |
| DELETE | `/api/v3/series/{id}` | `deleteFiles` (bool), `addImportListExclusion` (bool) | void |
| GET | `/api/v3/calendar` | `start`, `end` (ISO datetime), `includeSeries` (bool) | `Episode[]` |
| GET | `/api/v3/queue` | `page`, `pageSize`, `sortKey`, `sortDirection` | `PagingResource<QueueRecord>` |
| GET | `/api/v3/qualityprofile` | - | `QualityProfile[]` |
| GET | `/api/v3/rootfolder` | - | `RootFolder[]` |

### Key Response Schemas (Sonarr)

**SeriesLookupResult** (from `/series/lookup`):
- `title` (string), `sortTitle` (string)
- `status` (string: "continuing" | "ended" | "upcoming" | "deleted")
- `overview` (string, nullable), `network` (string, nullable)
- `year` (number), `runtime` (number)
- `tvdbId` (number), `imdbId` (string, nullable), `tvMazeId` (number)
- `titleSlug` (string), `cleanTitle` (string)
- `images` (array of `{ coverType, remoteUrl }`), `seasons` (array of `{ seasonNumber, monitored }`)
- `genres` (string[]), `ratings` (object), `certification` (string, nullable)
- `added` (string, ISO date), `firstAired` (string, nullable)
- Note: `id` is 0 for lookup results (not yet in Sonarr)

**AddSeriesInput** (POST body for `/series`):
- Required: `title`, `tvdbId`, `qualityProfileId`, `rootFolderPath`, `monitored`, `seasons`, `titleSlug`
- Optional: `seasonFolder` (bool, default true), `seriesType` ("standard" | "daily" | "anime"), `tags`, `images`
- `addOptions`: `{ searchForMissingEpisodes, monitor }` where monitor is "all" | "future" | "missing" | "existing" | "pilot" | "firstSeason" | "lastSeason" | "none"

**QualityProfile**: `id` (number), `name` (string), `upgradeAllowed` (bool), `cutoff` (number), `items` (array)

**RootFolder**: `id` (number), `path` (string), `freeSpace` (number)

**QueueRecord**: `id`, `seriesId`, `episodeId`, `title`, `size`, `sizeleft`, `status`, `trackedDownloadStatus`, `trackedDownloadState`, `timeleft`, `estimatedCompletionTime`

## API Reference: Radarr v3

### Authentication
- **Header:** `X-Api-Key: <key>`
- **Query:** `?apikey=<key>`
- **Base path:** `/api/v3/`
- **Default port:** 7878

### Endpoints Required for This Phase

| Method | Path | Parameters | Response |
|--------|------|------------|----------|
| GET | `/api/v3/movie/lookup` | `term` (string) | `MovieLookupResult[]` |
| GET | `/api/v3/movie/lookup/tmdb` | `tmdbId` (number) | `MovieLookupResult` |
| GET | `/api/v3/movie` | - | `Movie[]` |
| POST | `/api/v3/movie` | body: MovieResource | `Movie` |
| DELETE | `/api/v3/movie/{id}` | `deleteFiles` (bool), `addImportExclusion` (bool) | void |
| GET | `/api/v3/calendar` | `start`, `end` (ISO datetime), `unmonitored` (bool) | `Movie[]` |
| GET | `/api/v3/queue` | `page`, `pageSize`, `sortKey`, `sortDirection`, `includeUnknownMovieItems` (bool) | `PagingResource<QueueRecord>` |
| GET | `/api/v3/qualityprofile` | - | `QualityProfile[]` |
| GET | `/api/v3/rootfolder` | - | `RootFolder[]` |

### Key Response Schemas (Radarr)

**MovieLookupResult** (from `/movie/lookup`):
- `title` (string), `originalTitle` (string), `sortTitle` (string)
- `status` (string: "released" | "inCinemas" | "announced" | "deleted")
- `overview` (string, nullable), `year` (number), `runtime` (number)
- `tmdbId` (number), `imdbId` (string, nullable)
- `titleSlug` (string), `cleanTitle` (string)
- `images` (array of `{ coverType, remoteUrl }`), `genres` (string[])
- `ratings` (object), `certification` (string, nullable)
- `studio` (string, nullable), `youTubeTrailerId` (string, nullable)
- `inCinemas` (string, nullable, ISO date), `physicalRelease` (string, nullable, ISO date)
- `digitalRelease` (string, nullable, ISO date)
- Note: `id` is 0 for lookup results (not yet in Radarr)

**AddMovieInput** (POST body for `/movie`):
- Required: `title`, `tmdbId`, `qualityProfileId`, `rootFolderPath`, `monitored`
- Required: `minimumAvailability` ("announced" | "inCinemas" | "released")
- Optional: `tags`, `images`, `titleSlug`
- `addOptions`: `{ searchForMovie (bool), monitor ("movieOnly" | "movieAndCollection" | "none") }`

**QualityProfile**: `id` (number), `name` (string), `upgradeAllowed` (bool), `cutoff` (number), `items` (array)

**RootFolder**: `id` (number), `path` (string), `freeSpace` (number)

**QueueRecord**: `id`, `movieId`, `title`, `size`, `sizeleft`, `status`, `trackedDownloadStatus`, `trackedDownloadState`, `timeleft`, `estimatedCompletionTime`, `protocol`, `downloadClient`

## Differences Between Sonarr and Radarr APIs

| Aspect | Sonarr | Radarr |
|--------|--------|--------|
| Media ID source | `tvdbId` (TheTVDB) | `tmdbId` (TheMovieDB) |
| Resource name | `series` | `movie` |
| Lookup endpoint | `/series/lookup?term=` | `/movie/lookup?term=` |
| Has seasons | Yes (`seasons` array) | No |
| Min availability | N/A | `minimumAvailability` required on add |
| Season folders | `seasonFolder` (bool) | N/A |
| Series type | `seriesType` (standard/daily/anime) | N/A |
| Delete exclusion param | `addImportListExclusion` | `addImportExclusion` |
| Calendar returns | Episodes (with optional series) | Movies |
| Queue identifies | `seriesId` + `episodeId` | `movieId` |
| Add options monitor | "all", "future", "missing", etc. | "movieOnly", "movieAndCollection", "none" |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP requests | Custom XMLHttpRequest wrapper | Node.js 22 native `fetch` | Stable, well-tested, supports AbortSignal |
| Request timeout | `setTimeout` + manual abort | `AbortSignal.timeout(ms)` | Built-in, cleaner, auto-cleans up |
| URL construction | String concatenation | `new URL()` + `URLSearchParams` | Handles encoding, base URL resolution, edge cases |
| Response type safety | Manual `as` casts on JSON | `zod.safeParse()` with schema | Runtime validation + type inference in one step |
| Error classification | `if (error.message.includes(...))` | Custom error classes (ConnectionError, ValidationError) | `instanceof` checks, structured logging, clean switch |
| API key injection | Passing key to every method | Encapsulated in client constructor | Single source of truth, no accidental key leaks in logs |

**Key insight:** The Sonarr/Radarr APIs are straightforward REST with JSON. No WebSocket, no streaming, no OAuth. A thin `fetch` wrapper with Zod validation is all that's needed. Adding a library would add complexity without benefit.

## Common Pitfalls

### Pitfall 1: Strict Zod Schemas Breaking on Server Updates
**What goes wrong:** Zod `z.object()` strips unknown keys by default in Zod 4, but if you use `.strict()`, new fields from API updates cause parse failures.
**Why it happens:** Sonarr/Radarr add new response fields in minor updates without API version bumps.
**How to avoid:** Use `.passthrough()` on response schemas so unknown fields are preserved but not validated. Only define schemas for fields the application actually uses.
**Warning signs:** Tests pass locally but fail against a real server after it updates.

### Pitfall 2: Lookup Results Don't Have Sonarr/Radarr IDs
**What goes wrong:** Code assumes `id` from lookup results can be used for other API calls.
**Why it happens:** `/series/lookup` and `/movie/lookup` return `id: 0` because the media is not yet added to the local database. The `id` is only populated after a POST to add.
**How to avoid:** Use `tvdbId`/`tmdbId` as the identifier from search results. After adding, use the returned `id` from the POST response.
**Warning signs:** Getting 404s when trying to operate on searched-but-not-added media.

### Pitfall 3: Missing Required Fields on Add Operations
**What goes wrong:** POST to add series/movie returns 400 or NullReferenceException.
**Why it happens:** The APIs require specific fields that aren't obvious: Sonarr needs `titleSlug` and `seasons` array from the lookup result; Radarr needs `minimumAvailability`.
**How to avoid:** Carry over the full lookup result when adding, then overlay user choices (quality profile, root folder, monitoring). Build helper functions that merge lookup data with add options.
**Warning signs:** 400 errors with unhelpful messages from the API.

### Pitfall 4: Timeout Too Short for Search Operations
**What goes wrong:** Search requests (especially first search after server start) time out.
**Why it happens:** Sonarr/Radarr search proxies through external databases (TheTVDB, TheMovieDB) which can be slow. First requests may need to warm caches.
**How to avoid:** Use longer timeouts for search operations (15-30s) vs CRUD operations (10s). Make timeout configurable per operation type.
**Warning signs:** Intermittent timeout errors on search but not on other operations.

### Pitfall 5: Assuming Both Servers Are Always Available
**What goes wrong:** App crashes on startup because one server is down for maintenance.
**Why it happens:** Plugin throws during registration when it can't connect.
**How to avoid:** Catch connection errors during plugin registration. Log warnings but still register the client. Let individual operations fail with user-friendly messages. The health endpoint should report degraded status.
**Warning signs:** App won't start when Docker Compose brings services up in wrong order.

### Pitfall 6: Windows Path Escaping in Root Folders
**What goes wrong:** Root folder paths with backslashes get mangled in JSON serialization.
**Why it happens:** JSON requires escaping backslashes. Fetched root folder paths may contain `\\` from Windows servers.
**How to avoid:** Use the root folder path exactly as returned by the API (it's already correctly formatted for the server). Never transform or "clean" paths client-side.
**Warning signs:** "Path not found" errors when adding media despite the root folder existing.

## Code Examples

Verified patterns from official sources and API specifications:

### Sonarr: Search for Series
```typescript
// Source: Sonarr OpenAPI spec /api/v3/series/lookup
const results = await sonarr.searchSeries("Breaking Bad");
// Returns: Array of SeriesLookupResult
// Each has: title, tvdbId, year, overview, network, seasons, images, titleSlug
```

### Sonarr: Add Series from Lookup Result
```typescript
// Source: Sonarr OpenAPI spec POST /api/v3/series + forum examples
const lookupResult = results[0]; // from searchSeries

await sonarr.addSeries({
  title: lookupResult.title,
  tvdbId: lookupResult.tvdbId,
  qualityProfileId: cachedProfiles[0].id, // from startup cache
  rootFolderPath: cachedFolders[0].path,  // from startup cache
  titleSlug: lookupResult.titleSlug,      // REQUIRED: from lookup
  images: lookupResult.images,            // carry over
  seasons: lookupResult.seasons,          // REQUIRED: from lookup
  monitored: true,
  seasonFolder: true,
  addOptions: {
    searchForMissingEpisodes: true,
    monitor: "all",
  },
});
```

### Radarr: Add Movie from Lookup Result
```typescript
// Source: Radarr OpenAPI spec POST /api/v3/movie + GitHub issue #7095
const lookupResult = movies[0]; // from searchMovies

await radarr.addMovie({
  title: lookupResult.title,
  tmdbId: lookupResult.tmdbId,
  qualityProfileId: cachedProfiles[0].id,
  rootFolderPath: cachedFolders[0].path,
  monitored: true,
  minimumAvailability: "released", // REQUIRED for Radarr
  addOptions: {
    searchForMovie: true,
    monitor: "movieOnly",
  },
});
```

### Sonarr: Delete Series
```typescript
// Source: Sonarr OpenAPI spec DELETE /api/v3/series/{id}
await sonarr.removeSeries(seriesId, { deleteFiles: false, addImportListExclusion: false });
```

### Radarr: Delete Movie
```typescript
// Source: Radarr OpenAPI spec DELETE /api/v3/movie/{id}
await radarr.removeMovie(movieId, { deleteFiles: false, addImportExclusion: false });
```

### Get Queue with Pagination
```typescript
// Source: Radarr/Sonarr OpenAPI spec GET /api/v3/queue
const queue = await sonarr.getQueue({ page: 1, pageSize: 20 });
// Returns: { page, pageSize, totalRecords, records: QueueRecord[] }
```

### Error Handling Pattern
```typescript
// Handling connection errors at the operation level
try {
  const results = await sonarr.searchSeries("Breaking Bad");
} catch (err) {
  if (err instanceof ConnectionError) {
    return "Sonarr is currently unreachable. Please try again later.";
  }
  if (err instanceof ValidationError) {
    log.error({ err }, "Unexpected response from Sonarr");
    return "Sonarr returned an unexpected response. This may indicate a version mismatch.";
  }
  throw err; // unexpected error, let it propagate
}
```

### Zod Schema with Passthrough
```typescript
// Use .passthrough() to allow unknown fields from API updates
const SeriesLookupSchema = z.object({
  title: z.string(),
  sortTitle: z.string(),
  status: z.string(),
  overview: z.string().nullable(),
  network: z.string().nullable(),
  year: z.number(),
  runtime: z.number(),
  tvdbId: z.number(),
  imdbId: z.string().nullable(),
  tvMazeId: z.number().optional(),
  titleSlug: z.string(),
  images: z.array(z.object({
    coverType: z.string(),
    remoteUrl: z.string().optional(),
    url: z.string().optional(),
  }).passthrough()),
  seasons: z.array(z.object({
    seasonNumber: z.number(),
    monitored: z.boolean(),
  }).passthrough()),
  genres: z.array(z.string()),
  certification: z.string().nullable().optional(),
  firstAired: z.string().nullable().optional(),
  added: z.string().optional(),
  ratings: z.object({}).passthrough().optional(),
}).passthrough();

export type SeriesLookupResult = z.infer<typeof SeriesLookupSchema>;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `/api/command` without version | `/api/v3/command` with version prefix | Sonarr v3 -> v4 | All API calls must include v3 prefix |
| `languageProfileId` on series | Removed in Sonarr v4 | Sonarr v4 | No longer needed in add requests |
| `seriesId` as string in commands | `seriesId` as integer | Sonarr v4 | Must use numeric IDs, not strings |
| `profileId` for quality | `qualityProfileId` | Both apps | Field name changed, old name may still work |
| No API version in path | `/api/v3/` standard | Current | Both apps standardized on v3 API path |

**Deprecated/outdated:**
- `languageProfileId`: Removed in Sonarr v4, do NOT include in requests
- `tvRageId`: TheTVRage is defunct, field still exists but always 0
- Sonarr API v5: Exists only on development branch (`v5-develop`), not released, no ETA. Do NOT target it.
- Radarr API v4: Does not exist. Radarr v5/v6 still uses `/api/v3/`

## Config Changes Required

The current `config.ts` has Sonarr/Radarr env vars as optional. For Phase 4, these need to remain optional (graceful degradation) but validated when present:

```typescript
// Already in config.ts -- no changes needed:
SONARR_URL: z.string().url().optional(),
SONARR_API_KEY: z.string().min(1).optional(),
RADARR_URL: z.string().url().optional(),
RADARR_API_KEY: z.string().min(1).optional(),
```

## Testing Strategy

The project uses Vitest 4.0.18 (installed but no tests written yet). For media server clients:

- **Unit tests for Zod schemas:** Validate known API response shapes parse correctly, and edge cases (null fields, extra fields) are handled.
- **Unit tests for client methods:** Mock `fetch` using Vitest's `vi.fn()` to return canned responses. Verify correct URL construction, headers, error handling.
- **No integration tests against live servers:** These clients are designed to be tested with mocked fetch. Live server testing happens during manual verification.

Mock pattern for fetch:
```typescript
import { vi } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

mockFetch.mockResolvedValueOnce(
  new Response(JSON.stringify([{ title: "Breaking Bad", tvdbId: 81189, year: 2008 }]), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }),
);
```

## Open Questions

1. **Sonarr `seriesType` default**
   - What we know: Sonarr supports "standard", "daily", and "anime" series types
   - What's unclear: Whether there's a sensible default or if we should carry over from lookup result
   - Recommendation: Use "standard" as default, allow override. Lookup results include this field.

2. **Rate limiting behavior**
   - What we know: No rate limiting documentation found for either API
   - What's unclear: Whether rapid sequential requests (e.g., adding multiple series) could cause issues
   - Recommendation: Implement serial requests (no parallel batching) for add/delete operations. Search can be concurrent.

3. **Radarr `minimumAvailability` best default**
   - What we know: Options are "announced", "inCinemas", "released"
   - What's unclear: What most users expect
   - Recommendation: Default to "announced" (most permissive -- starts monitoring earliest)

## Sources

### Primary (HIGH confidence)
- Sonarr OpenAPI Spec (`Sonarr.Api.V3/openapi.json` from GitHub develop branch) - endpoints, parameters, response schemas
- Radarr OpenAPI Spec (`Radarr.Api.V3/openapi.json` from GitHub develop branch) - endpoints, parameters, response schemas
- [Radarr REST API DeepWiki](https://deepwiki.com/radarr/radarr/4.1-rest-api) - comprehensive endpoint catalog, field names, authentication
- [Sonarr API DeepWiki](https://deepwiki.com/Sonarr/Sonarr/2.2-api-and-application-startup) - API architecture, versioning, authentication
- [GitHub Sonarr Releases](https://github.com/Sonarr/Sonarr/releases) - confirmed v4.0.16 is latest stable
- [GitHub Radarr Releases](https://github.com/Radarr/Radarr/releases) - confirmed v6.0.4 is latest stable
- [Radarr Issue #7095](https://github.com/Radarr/Radarr/issues/7095) - add movie required fields verified
- [Go starr package](https://pkg.go.dev/golift.io/starr/sonarr) - AddSeriesInput struct fields cross-referenced

### Secondary (MEDIUM confidence)
- [Sonarr v4 API Changes Forum](https://forums.sonarr.tv/t/need-some-help-with-changes-in-v4-api-commands/33092) - v3->v4 breaking changes
- [Sonarr v3 Add Series Forum](https://forums.sonarr.tv/t/v3-api-add-series-request-example/33393) - add series required fields
- [MDN AbortSignal.timeout()](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static) - native fetch timeout pattern
- [Sonarr v5 Milestone](https://github.com/Sonarr/Sonarr/milestone/4) - v5 not released, 80% complete, no ETA

### Tertiary (LOW confidence)
- Default `minimumAvailability` value recommendation (based on general community patterns, not official guidance)
- Rate limiting behavior (no documentation found; absence of evidence is not evidence of absence)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies needed, all tools verified in Node.js 22
- Architecture: HIGH - Patterns directly mirror existing project conventions (Fastify plugins, Zod, decorator pattern)
- API endpoints: HIGH - Verified against official OpenAPI specs from GitHub source
- Response schemas: MEDIUM-HIGH - Cross-referenced across Go package, Python SDKs, OpenAPI specs, and forum examples; field names consistent across sources
- Pitfalls: HIGH - Common issues documented in GitHub issues and forums with confirmed resolutions
- Testing: MEDIUM - Vitest mock patterns are standard but no project tests exist yet to validate conventions

**Research date:** 2026-02-13
**Valid until:** 2026-03-15 (APIs are stable; both servers on v3 API path with no imminent breaking changes)

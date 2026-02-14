# Phase 6: Search and Discovery - Research

**Researched:** 2026-02-13
**Domain:** LLM tool definitions for media search, library cross-referencing, ambiguity resolution, schedule viewing
**Confidence:** HIGH

## Summary

Phase 6 builds the first set of real LLM tools on top of the conversation engine completed in Phase 5. The existing infrastructure is comprehensive: `ToolRegistry` with `defineTool()`, `toolCallLoop()` with confirmation interception, `processConversation()` orchestration, and fully typed Sonarr/Radarr clients with `searchSeries()`, `searchMovies()`, `getSeries()`, `getMovies()`, `getCalendar()`, and `getUpcoming()`. This phase registers new tools in the conversation plugin and lets the LLM route natural language to the correct API calls.

The core challenge is NOT plumbing (that's done) but designing tools that produce LLM-friendly output within SMS constraints (~160 chars per segment, but Twilio concatenates up to 1600 chars). Search results must include enough detail for disambiguation (title, year, overview snippet) while staying concise. Library cross-referencing requires comparing API search results against the user's existing library by matching on unique IDs (tvdbId for series, tmdbId for movies). Ambiguity resolution should be handled by the LLM via system prompt instructions, not custom code -- the LLM naturally decides whether to present options or auto-select based on the result set.

**Primary recommendation:** Define 4-5 tools (`search_movies`, `search_series`, `get_upcoming_movies`, `get_upcoming_episodes`, and optionally a combined `search_media`), register them in the conversation plugin, enrich search results with `inLibrary` boolean by cross-referencing with `getMovies()`/`getSeries()`, and let the system prompt guide the LLM on formatting and ambiguity handling.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing `ToolRegistry` + `defineTool()` | (Phase 5) | Tool definition and registration | Already built, tested, and wired into conversation engine |
| Existing `SonarrClient` | (Phase 4) | TV show search, library lookup, calendar | Already built with Zod-validated responses |
| Existing `RadarrClient` | (Phase 4) | Movie search, library lookup, upcoming | Already built with Zod-validated responses |
| `zod` | ^4.3.6 (existing) | Tool parameter schema definitions | Already in project; `z.toJSONSchema()` converts to OpenAI tool format |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `openai` | ^6.22.0 (existing) | LLM interaction with tool definitions | Already wired; tools auto-injected via `registry.getDefinitions()` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Separate `search_movies` + `search_series` tools | Single `search_media` tool that searches both | Two separate tools give the LLM clearer intent signals; a combined tool requires the LLM to specify media type or search both, adding latency. Separate tools are recommended for this codebase. |
| LLM-driven ambiguity resolution | Custom scoring/ranking code | The LLM is better at judging "is this a strong match?" from context. Custom code would duplicate LLM reasoning and be brittle. Let the system prompt instruct the LLM on when to auto-select vs. present options. |
| Tool-level library cross-referencing | Separate `check_library` tool | Embedding library status in search results avoids an extra tool call round-trip. The LLM gets everything it needs in one call. |

**Installation:**
```bash
# No new dependencies needed -- all libraries already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  conversation/
    tools/
      search-movies.ts      # search_movies tool definition
      search-series.ts      # search_series tool definition
      get-upcoming.ts       # get_upcoming_episodes + get_upcoming_movies tools
      index.ts              # Re-exports all tool definitions for registration
    tools.ts                # (existing) ToolRegistry, defineTool()
    tool-loop.ts            # (existing) unchanged
    engine.ts               # (existing) unchanged
    system-prompt.ts        # (modified) add search/ambiguity guidance
  plugins/
    conversation.ts         # (modified) register new tools
```

**Alternative (simpler, recommended for this project):** Keep all tool definitions in a single file `src/conversation/tools/search-tools.ts` or directly expand `src/plugins/conversation.ts` with inline tool registrations. The tools are thin wrappers (5-30 lines each), so a single file avoids over-fragmentation.

### Pattern 1: Tool Definition with Library Cross-Reference
**What:** A search tool that calls the API, then cross-references results against the user's library to add an `inLibrary` boolean.
**When to use:** For `search_movies` and `search_series` tools.

```typescript
// Source: Existing codebase patterns (defineTool in tools.ts, clients in media/)
import { z } from "zod";
import { defineTool } from "../tools.js";

const searchMoviesTool = defineTool(
  "search_movies",
  "Search for movies by title. Returns matching movies with title, year, overview, and whether they are already in the library. Use this when the user asks to find, search for, or look up a movie.",
  z.object({
    query: z.string().describe("The movie title to search for"),
  }),
  "safe",
  async (args, context) => {
    if (!context.radarr) {
      return { error: "Radarr is not configured" };
    }

    const [results, library] = await Promise.all([
      context.radarr.searchMovies(args.query),
      context.radarr.getMovies(),
    ]);

    const libraryTmdbIds = new Set(library.map((m) => m.tmdbId));

    return results.slice(0, 10).map((movie) => ({
      title: movie.title,
      year: movie.year,
      tmdbId: movie.tmdbId,
      overview: movie.overview?.slice(0, 150) ?? null,
      inLibrary: libraryTmdbIds.has(movie.tmdbId),
      status: movie.status,
    }));
  },
);
```

### Pattern 2: Calendar/Schedule Tool with Date Range
**What:** A tool that fetches upcoming episodes or movies within a date range.
**When to use:** For `get_upcoming_episodes` and `get_upcoming_movies` tools.

```typescript
const getUpcomingEpisodesTool = defineTool(
  "get_upcoming_episodes",
  "Get upcoming TV episodes airing in the next few days. Shows episode title, series name, air date, season/episode numbers. Use when the user asks about upcoming shows, what's airing, or TV schedules.",
  z.object({
    days: z.number().min(1).max(30).default(7)
      .describe("Number of days to look ahead (default 7)"),
  }),
  "safe",
  async (args, context) => {
    if (!context.sonarr) {
      return { error: "Sonarr is not configured" };
    }

    const start = new Date().toISOString().split("T")[0];
    const end = new Date(Date.now() + args.days * 86400000)
      .toISOString().split("T")[0];

    const episodes = await context.sonarr.getCalendar(start, end);

    return episodes.map((ep) => ({
      seriesId: ep.seriesId,
      title: ep.title,
      seasonNumber: ep.seasonNumber,
      episodeNumber: ep.episodeNumber,
      airDateUtc: ep.airDateUtc,
    }));
  },
);
```

### Pattern 3: System Prompt Guidance for Ambiguity Resolution
**What:** Add instructions to the system prompt telling the LLM how to handle search results -- when to auto-select and when to present options.
**When to use:** Always -- this is the primary mechanism for SRCH-04.

```typescript
// Additional system prompt lines for search behavior
const SEARCH_GUIDELINES = `
Search behavior:
- When search returns exactly one result, present it directly with details.
- When search returns multiple results with one clear best match (exact title + year match), present that match and mention other options exist.
- When results are ambiguous (multiple similar titles, different years), present the top 3-5 as a numbered list so the user can pick one.
- Always mention if a result is already in the library.
- Keep overviews to 1-2 sentences max. Users are reading on their phone.
- Include year and network/studio to help distinguish similar titles.`;
```

### Pattern 4: Enriching Sonarr Calendar with Series Names
**What:** The Sonarr calendar endpoint returns episodes with `seriesId` but the series title may need to be resolved. When `includeSeries: true` is passed (already done in the client), the response embeds series data. However, the current `EpisodeSchema` does not capture the embedded series object.
**When to use:** When building the `get_upcoming_episodes` tool.

```typescript
// Option A: Extend EpisodeSchema to capture embedded series (if available)
// The Sonarr API with includeSeries:true embeds a 'series' object in each episode
// Current EpisodeSchema uses .passthrough() so the data IS returned, just not typed

// Option B: Fetch series list separately and join by seriesId
// More reliable, works regardless of includeSeries support
const seriesList = await context.sonarr.getSeries();
const seriesMap = new Map(seriesList.map((s) => [s.id, s.title]));

const enriched = episodes.map((ep) => ({
  ...ep,
  seriesTitle: seriesMap.get(ep.seriesId) ?? "Unknown Series",
}));
```

### Anti-Patterns to Avoid
- **Returning raw API responses to the LLM:** API responses contain dozens of fields. Only return what the LLM needs for the response (title, year, overview snippet, inLibrary). Large payloads waste tokens and confuse the model.
- **Building custom disambiguation logic in code:** The LLM is better at deciding "is this a strong match?" based on the user's natural language query and the results. System prompt instructions are the right lever.
- **Separate tool for library check:** Don't make the LLM call `search_movies` then `check_library`. Embed library status in the search results to minimize round-trips and token usage.
- **Forgetting null-checks on optional clients:** `context.sonarr` and `context.radarr` are optional decorators. Every tool executor must check for null and return a clear error message.
- **Returning all search results:** Sonarr/Radarr searches can return 20+ results. Limit to 5-10 in the tool response. The system prompt tells the LLM to present 3-5 to the user.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Search API calls | Custom HTTP search endpoints | `SonarrClient.searchSeries()` / `RadarrClient.searchMovies()` | Already built with timeouts, error handling, Zod validation |
| Library lookup | Manual database queries for library state | `SonarrClient.getSeries()` / `RadarrClient.getMovies()` | Returns full library with IDs for cross-referencing |
| Disambiguation UI | Numbered option picker with state machine | LLM + system prompt instructions | The LLM naturally handles "which one?" follow-ups via conversation history |
| Calendar formatting | Custom date range calculation and formatting | `SonarrClient.getCalendar()` / `RadarrClient.getUpcoming()` | Already built with date range parameters |
| Tool registration and execution | Custom tool routing code | `ToolRegistry.register()` + `toolCallLoop()` | Phase 5 infrastructure handles everything |
| SMS response formatting | Template engine for SMS responses | System prompt instructions to the LLM | The LLM adapts formatting naturally; templates would be rigid |

**Key insight:** This phase is almost entirely about defining tool schemas (Zod objects), writing thin executor functions (5-30 lines wrapping existing client calls), and tuning the system prompt. The heavy infrastructure is done.

## Common Pitfalls

### Pitfall 1: Returning Too Much Data to the LLM
**What goes wrong:** Tool returns full API response objects with 30+ fields per result, 20+ results. LLM context fills up, response quality degrades, token costs spike.
**Why it happens:** Easy to just `return results` from the tool executor without filtering.
**How to avoid:** Map results to minimal objects: `{ title, year, tmdbId/tvdbId, overview (truncated), inLibrary, status }`. Limit to 5-10 results.
**Warning signs:** LLM responses become verbose or confused, slow response times, high token usage.

### Pitfall 2: Library Cross-Reference Performance
**What goes wrong:** Every search call triggers a full `getMovies()` or `getSeries()` call to the API for cross-referencing. With large libraries, this adds latency.
**Why it happens:** `getMovies()`/`getSeries()` fetch the entire library each time.
**How to avoid:** Accept the latency for now (libraries are typically < 5000 items, API is local network). If it becomes a problem, cache library IDs in memory with a TTL. Do NOT prematurely optimize -- the API calls are to a local server and should return in < 1 second.
**Warning signs:** Search response times > 5 seconds, user complaints about slowness.

### Pitfall 3: Sonarr Calendar Missing Series Titles
**What goes wrong:** Calendar episodes show `seriesId: 123` but no human-readable series name. The LLM response says "Episode 5 of series 123 airs tomorrow."
**Why it happens:** The current `EpisodeSchema` doesn't extract the embedded `series` object (even though `includeSeries: true` is passed). The `.passthrough()` means the data is there but untyped.
**How to avoid:** Two options: (A) Access the series data from the passthrough fields via type assertion, or (B) fetch the series list separately and build a `seriesId -> title` lookup map. Option B is more reliable and doesn't require schema changes.
**Warning signs:** LLM responses referencing numeric IDs instead of show names.

### Pitfall 4: Optional Client Null Checks
**What goes wrong:** Tool executor calls `context.sonarr.searchSeries()` without checking if `context.sonarr` exists. Runtime crash: "Cannot read properties of undefined."
**Why it happens:** Sonarr/Radarr decorators are optional (`sonarr?: SonarrClient`). In dev/test environments, one or both might not be configured.
**How to avoid:** Every tool executor starts with `if (!context.sonarr) { return { error: "Sonarr is not configured" }; }`. Return a structured error that the LLM can relay to the user.
**Warning signs:** Unhandled promise rejections in logs, "something went wrong" fallback messages.

### Pitfall 5: Tool Description Quality
**What goes wrong:** LLM calls the wrong tool or doesn't call any tool. User says "find me Breaking Bad" and the LLM responds with text instead of calling `search_series`.
**Why it happens:** Tool descriptions are vague or don't specify when to use the tool. With multiple search tools, the LLM needs clear guidance.
**How to avoid:** Follow OpenAI best practices: describe WHEN to use the tool, not just WHAT it does. Include trigger phrases. For example: "Search for TV shows by title. Use this when the user asks to find, search for, or look up a TV show, series, or program."
**Warning signs:** LLM hallucinating answers instead of calling tools, calling the wrong search tool (movies vs. series).

### Pitfall 6: Search Timeout Eating Into Conversation Time
**What goes wrong:** Sonarr/Radarr search proxies to external services (TheTVDB/TMDB). If those are slow, the 30-second timeout may trigger, and the user waits a long time.
**Why it happens:** Search operations have 30-second timeouts (already set in the clients). External services can be slow.
**How to avoid:** The architecture already handles this (async processing, immediate TwiML response from Phase 5). The tool executor should catch `ConnectionError` and return a friendly error message to the LLM. The existing error handling in `toolCallLoop` already catches and serializes tool execution errors.
**Warning signs:** Users seeing long delays, timeout errors in logs.

## Code Examples

Verified patterns from the existing codebase and official sources.

### Complete Tool Registration in Conversation Plugin

```typescript
// Source: Existing src/plugins/conversation.ts pattern
// Modified to register search tools alongside check_status

import { createSearchTools } from "../conversation/tools/search-tools.js";

export default fp(
  async (fastify: FastifyInstance) => {
    // ... existing LLM client creation ...
    const registry = createToolRegistry();

    // Register search and discovery tools
    const searchTools = createSearchTools();
    for (const tool of searchTools) {
      registry.register(tool);
    }

    fastify.decorate("llm", client);
    fastify.decorate("toolRegistry", registry);
  },
  { name: "conversation", dependencies: ["database"] },
);
```

### Search Movies Tool (Complete)

```typescript
// Source: Existing defineTool pattern + RadarrClient API
import { z } from "zod";
import { defineTool } from "../tools.js";

export const searchMoviesTool = defineTool(
  "search_movies",
  "Search for movies by title. Returns matching movies with title, year, overview, and whether they are already in the user's library. Use when the user wants to find, look up, or search for a movie.",
  z.object({
    query: z.string().describe("The movie title to search for"),
  }),
  "safe",
  async (args, context) => {
    if (!context.radarr) {
      return { error: "Movie server (Radarr) is not configured" };
    }

    const [results, library] = await Promise.all([
      context.radarr.searchMovies(args.query),
      context.radarr.getMovies(),
    ]);

    const libraryTmdbIds = new Set(library.map((m) => m.tmdbId));

    if (results.length === 0) {
      return { results: [], message: "No movies found" };
    }

    return {
      results: results.slice(0, 10).map((movie) => ({
        title: movie.title,
        year: movie.year,
        tmdbId: movie.tmdbId,
        overview: movie.overview
          ? movie.overview.slice(0, 150) + (movie.overview.length > 150 ? "..." : "")
          : null,
        inLibrary: libraryTmdbIds.has(movie.tmdbId),
        status: movie.status,
        studio: movie.studio ?? null,
      })),
    };
  },
);
```

### Search Series Tool (Complete)

```typescript
export const searchSeriesTool = defineTool(
  "search_series",
  "Search for TV shows/series by title. Returns matching shows with title, year, network, seasons, overview, and whether they are already in the user's library. Use when the user wants to find, look up, or search for a TV show, series, or program.",
  z.object({
    query: z.string().describe("The TV show title to search for"),
  }),
  "safe",
  async (args, context) => {
    if (!context.sonarr) {
      return { error: "TV server (Sonarr) is not configured" };
    }

    const [results, library] = await Promise.all([
      context.sonarr.searchSeries(args.query),
      context.sonarr.getSeries(),
    ]);

    const libraryTvdbIds = new Set(library.map((s) => s.tvdbId));

    if (results.length === 0) {
      return { results: [], message: "No TV shows found" };
    }

    return {
      results: results.slice(0, 10).map((series) => ({
        title: series.title,
        year: series.year,
        tvdbId: series.tvdbId,
        network: series.network,
        seasonCount: series.seasons.length,
        overview: series.overview
          ? series.overview.slice(0, 150) + (series.overview.length > 150 ? "..." : "")
          : null,
        inLibrary: libraryTvdbIds.has(series.tvdbId),
        status: series.status,
      })),
    };
  },
);
```

### Upcoming Episodes Tool (Complete)

```typescript
export const getUpcomingEpisodesTool = defineTool(
  "get_upcoming_episodes",
  "Get upcoming TV episodes airing soon. Shows series name, episode title, season/episode numbers, and air date. Use when the user asks about upcoming episodes, what's airing, TV schedule, or 'what's on'.",
  z.object({
    days: z.number().min(1).max(30).default(7)
      .describe("Number of days to look ahead (default 7)"),
  }),
  "safe",
  async (args, context) => {
    if (!context.sonarr) {
      return { error: "TV server (Sonarr) is not configured" };
    }

    const now = new Date();
    const start = now.toISOString().split("T")[0] as string;
    const end = new Date(now.getTime() + args.days * 86_400_000)
      .toISOString().split("T")[0] as string;

    const [episodes, seriesList] = await Promise.all([
      context.sonarr.getCalendar(start, end),
      context.sonarr.getSeries(),
    ]);

    const seriesMap = new Map(seriesList.map((s) => [s.id, s.title]));

    if (episodes.length === 0) {
      return { episodes: [], message: "No upcoming episodes" };
    }

    return {
      episodes: episodes.map((ep) => ({
        seriesTitle: seriesMap.get(ep.seriesId) ?? "Unknown Series",
        title: ep.title,
        seasonNumber: ep.seasonNumber,
        episodeNumber: ep.episodeNumber,
        airDateUtc: ep.airDateUtc,
        hasFile: ep.hasFile ?? false,
      })),
    };
  },
);
```

### Upcoming Movies Tool (Complete)

```typescript
export const getUpcomingMoviesTool = defineTool(
  "get_upcoming_movies",
  "Get upcoming movie releases (theatrical, digital, or physical). Shows title, year, release dates, and status. Use when the user asks about upcoming movies, new releases, or movie schedules.",
  z.object({
    days: z.number().min(1).max(90).default(30)
      .describe("Number of days to look ahead (default 30)"),
  }),
  "safe",
  async (args, context) => {
    if (!context.radarr) {
      return { error: "Movie server (Radarr) is not configured" };
    }

    const now = new Date();
    const start = now.toISOString().split("T")[0] as string;
    const end = new Date(now.getTime() + args.days * 86_400_000)
      .toISOString().split("T")[0] as string;

    const movies = await context.radarr.getUpcoming(start, end);

    if (movies.length === 0) {
      return { movies: [], message: "No upcoming movies" };
    }

    return {
      movies: movies.map((movie) => ({
        title: movie.title,
        year: movie.year,
        inCinemas: movie.inCinemas ?? null,
        physicalRelease: movie.physicalRelease ?? null,
        digitalRelease: movie.digitalRelease ?? null,
        status: movie.status,
        overview: movie.overview
          ? movie.overview.slice(0, 100) + (movie.overview.length > 100 ? "..." : "")
          : null,
      })),
    };
  },
);
```

### Updated System Prompt

```typescript
export const SYSTEM_PROMPT = `You are a helpful media management assistant. You help users search for, add, and manage movies and TV shows using Sonarr and Radarr.

Available capabilities:
- Search for movies and TV shows by title
- Check what's in the user's library
- Add movies or shows to the download list
- Remove media (requires user confirmation)
- Check download queue status
- View upcoming episodes and releases

Search behavior:
- When search returns exactly one result, present it directly with key details.
- When one result is clearly the best match (exact title match or very close), present it and briefly mention alternatives exist.
- When results are ambiguous (multiple similar titles, remakes, different years), present the top 3-5 as a numbered list with enough detail to choose (title, year, brief description).
- Always tell the user if a result is already in their library.
- Truncate overviews to 1-2 sentences. Users are on their phones.

Response format:
- Be concise. Users are texting via SMS, so keep responses short and scannable.
- Use line breaks between results for readability.
- Include year in parentheses after titles to distinguish versions.
- For TV shows, mention the network and number of seasons.
- For add operations, use sensible defaults (first root folder, first quality profile) unless the user specifies otherwise.
- Never execute remove/delete operations without explicit user confirmation.
- If a tool call fails, explain the error simply and suggest next steps.
- Refer to the user by name when available.`;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom disambiguation state machine | LLM-driven disambiguation via system prompt | Standard since GPT-4 tool calling (2023+) | No custom code needed; the LLM handles follow-up naturally via conversation history |
| Separate library-check API call | Embed `inLibrary` in search results | Standard pattern in media bot implementations | Reduces tool call round-trips; LLM gets full picture in one call |
| Hard-coded response templates | LLM formats responses per system prompt | Standard since LLM integration became common | More natural, adaptive responses; handles edge cases better than templates |
| `functions` parameter in OpenAI API | `tools` parameter | Nov 2023 | Already using `tools` in the project |

**Deprecated/outdated:**
- Building custom state machines for multi-turn disambiguation is unnecessary with LLM-based tool calling -- conversation history handles context naturally
- Hard-coded result formatting templates -- the LLM is better at adapting format to the specific query and result set

## Open Questions

1. **Library fetch performance at scale**
   - What we know: `getMovies()` and `getSeries()` fetch the entire library. For cross-referencing, we call this on every search. The API is local network.
   - What's unclear: Performance with very large libraries (5000+ items). Whether Radarr/Sonarr paginate or return everything at once.
   - Recommendation: Proceed without caching. Monitor response times. If > 2 seconds, add an in-memory cache with 5-minute TTL for library IDs. The Sonarr/Radarr APIs do return everything at once for `getSeries()`/`getMovies()` and this is how their web UIs work too.

2. **Sonarr calendar series title resolution**
   - What we know: The client passes `includeSeries: true` to the calendar endpoint. The `EpisodeSchema` uses `.passthrough()` so extra fields are preserved but untyped.
   - What's unclear: Whether all Sonarr versions reliably embed the full series object when `includeSeries: true` is set, and what fields are present.
   - Recommendation: Use the reliable approach of fetching the series list separately via `getSeries()` and building a `seriesId -> title` map. This is an extra API call but guaranteed to work across Sonarr versions.

3. **Should search_movies and search_series be separate tools or combined?**
   - What we know: Separate tools give the LLM clearer intent signals. A combined tool would search both simultaneously.
   - What's unclear: Whether users consistently say "movie" vs "show" or just say a title.
   - Recommendation: Use separate tools. The LLM is good at inferring media type from context ("Have you seen Breaking Bad?" -> series, "Where can I watch Inception?" -> movie). If the user's intent is genuinely ambiguous, the LLM can call both tools. The system prompt should guide this: "If the user doesn't specify movie or TV show, make your best guess. If truly uncertain, search both."

4. **Whether `z.number().default()` works correctly in tool call schemas**
   - What we know: Zod v4's `z.toJSONSchema()` should emit a `default` keyword in the generated JSON Schema. Whether the LLM respects this or sends the argument anyway depends on the provider.
   - What's unclear: Whether OpenAI-compatible providers respect JSON Schema defaults for omitted arguments, or whether the argument is always required.
   - Recommendation: Make parameters with defaults truly optional using `z.number().optional().default(7)` or just `.optional()` and handle the default in the executor. Test with the target LLM provider.

## Sources

### Primary (HIGH confidence)
- Existing codebase (`src/conversation/tools.ts`, `src/conversation/tool-loop.ts`) -- defineTool, ToolRegistry, tool call loop patterns
- Existing codebase (`src/media/sonarr/sonarr.client.ts`) -- searchSeries, getSeries, getCalendar signatures and schemas
- Existing codebase (`src/media/radarr/radarr.client.ts`) -- searchMovies, getMovies, getUpcoming signatures and schemas
- Existing codebase (`src/media/sonarr/sonarr.schemas.ts`, `src/media/radarr/radarr.schemas.ts`) -- Zod schemas showing all available fields
- Existing codebase (`src/conversation/system-prompt.ts`) -- current system prompt structure
- Existing codebase (`src/plugins/conversation.ts`) -- tool registration pattern

### Secondary (MEDIUM confidence)
- [OpenAI Function Calling Guide](https://platform.openai.com/docs/guides/function-calling) -- tool description best practices, schema design
- [OpenAI Cookbook: o3/o4-mini Prompting Guide](https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide/) -- tool description quality, few-shot examples, flat schemas
- [Sonarr API Docs](https://sonarr.tv/docs/api/) -- calendar endpoint parameters, includeSeries behavior
- [Radarr API Docs](https://radarr.video/docs/api/) -- calendar endpoint parameters, movie lookup fields

### Tertiary (LOW confidence)
- Sonarr `includeSeries` behavior across versions -- confirmed parameter exists and is passed, but exact embedded response shape not formally documented
- Zod v4 `z.number().default()` interaction with JSON Schema generation for LLM tool calls -- needs runtime testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and tested in prior phases; no new dependencies
- Architecture: HIGH -- tool definition and registration pattern proven in Phase 5 with check_status tool; this phase follows the exact same pattern
- Tool design: HIGH -- tool executors are thin wrappers around existing, tested client methods
- Ambiguity resolution: MEDIUM -- relying on LLM system prompt for disambiguation is the standard approach, but specific prompt wording may need iteration
- Calendar enrichment: MEDIUM -- two viable approaches (passthrough fields vs. separate fetch); separate fetch is safer

**Research date:** 2026-02-13
**Valid until:** 2026-03-15 (30 days -- the tool infrastructure is stable and the patterns are well-established)

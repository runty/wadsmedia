# Phase 7: Library Management - Research

**Researched:** 2026-02-13
**Domain:** LLM tool definitions for adding/removing media, sensible defaults from cached server config, confirmation flow for destructive actions, conversational context reference resolution
**Confidence:** HIGH

## Summary

Phase 7 adds the "write" counterpart to Phase 6's "read" tools. Users will be able to add movies and TV shows to their wanted lists, remove or unmonitor media, and reference previous conversation context naturally ("add that one", "the second one"). The existing infrastructure is comprehensive: `SonarrClient.addSeries()` / `RadarrClient.addMovie()` already accept typed input objects (`AddSeriesInput` / `AddMovieInput`), the confirmation system from Phase 5 already intercepts destructive tool calls, and the conversation history sliding window already preserves tool call results that the LLM can reference.

The core challenge is **sensible defaults**: the add tools must select a quality profile and root folder path automatically without asking the user. Both clients already cache `qualityProfiles[]` and `rootFolders[]` on startup via `loadCachedData()`. The add tools should use the first quality profile and first root folder as defaults. The second challenge is the **add tool parameter design**: the LLM needs to provide a media identifier (tmdbId for movies, tvdbId for series) from a previous search result, but the tool must handle constructing the full `AddSeriesInput` / `AddMovieInput` from the lookup data. This means the add tools will first perform a lookup by ID, then merge defaults, then POST.

The third challenge -- conversational context reference resolution ("add that one too") -- is **already solved by the existing architecture**. The conversation history preserves all tool call results (including search results with numbered items, tmdbIds, tvdbIds). The LLM naturally resolves anaphoric references ("that one", "the second one") by reading its own conversation history. The system prompt needs minor additions to instruct the LLM to use IDs from previous results when calling add/remove tools, but no custom code is needed.

**Primary recommendation:** Define 4 tools (`add_movie`, `add_series`, `remove_movie`, `remove_series`), make add tools "safe" tier (auto-execute) and remove tools "destructive" tier (require confirmation), use cached quality profiles and root folders for sensible defaults, and rely on the LLM + conversation history for context reference resolution with system prompt guidance.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing `ToolRegistry` + `defineTool()` | (Phase 5) | Tool definition and registration | Already built, tested, and wired into conversation engine |
| Existing `SonarrClient` | (Phase 4) | `addSeries()`, `removeSeries()`, `searchSeries()`, cached `qualityProfiles` and `rootFolders` | Already built with typed inputs and Zod validation |
| Existing `RadarrClient` | (Phase 4) | `addMovie()`, `removeMovie()`, `searchMovies()`, `lookupByTmdbId()`, cached `qualityProfiles` and `rootFolders` | Already built with typed inputs and Zod validation |
| Existing confirmation system | (Phase 5) | `ConfirmationTier`, `PendingAction`, destructive tool interception | Already intercepts destructive tools in tool-loop, saves pending action, processes yes/no |
| `zod` | ^4.3.6 (existing) | Tool parameter schema definitions | Already in project; `z.toJSONSchema()` converts to OpenAI tool format |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `openai` | ^6.22.0 (existing) | LLM interaction with tool definitions | Already wired; tools auto-injected via `registry.getDefinitions()` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Add tools that take tmdbId/tvdbId and auto-lookup | Add tools that take the full series/movie object from search | Taking IDs is simpler for the LLM to produce. The add tool does an extra lookup call, but this ensures the data is fresh and avoids the LLM needing to pass complex nested objects. |
| Separate `remove_movie` and `remove_series` tools | Single `remove_media` tool that infers type | Separate tools give the LLM clearer intent signals (consistent with the separate search tools from Phase 6). |
| PUT-based "unmonitor" as a separate tool | Combine unmonitor into the remove tool with a `deleteFiles` parameter | Simpler UX -- "remove" can mean either unmonitor or delete. The confirmation prompt should clarify the action. For MVP, just offer DELETE with the option to not delete files. Unmonitor via PUT can be added later. |
| Custom anaphora resolution code | LLM conversation history + system prompt | The LLM already has access to all previous tool results in its context window. It naturally resolves "that one" or "the second one" by reading previous search results. No custom code needed. |

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
      search-movies.ts        # (existing) search_movies tool
      search-series.ts        # (existing) search_series tool
      get-upcoming.ts         # (existing) get_upcoming_* tools
      add-movie.ts            # NEW: add_movie tool
      add-series.ts           # NEW: add_series tool
      remove-movie.ts         # NEW: remove_movie tool
      remove-series.ts        # NEW: remove_series tool
      index.ts                # (modified) re-export new tools
    tools.ts                  # (existing) ToolRegistry, defineTool()
    tool-loop.ts              # (existing) unchanged -- confirmation interception already works
    engine.ts                 # (existing) unchanged -- confirmation flow already works
    system-prompt.ts          # (modified) add library management guidance
  plugins/
    conversation.ts           # (modified) register new tools
```

### Pattern 1: Add Tool with Sensible Defaults from Cached Config
**What:** An add tool that takes a media identifier (tmdbId/tvdbId), looks up the full media object, applies sensible defaults from cached server config, and POSTs to the API.
**When to use:** For `add_movie` and `add_series` tools.

```typescript
// Source: Existing codebase patterns (sonarr.client.ts cached data, defineTool pattern)
export const addMovieTool = defineTool(
  "add_movie",
  "Add a movie to the wanted/download list. Use the tmdbId from search results. Applies sensible quality and path defaults automatically. Use when the user wants to add, download, get, or request a movie.",
  z.object({
    tmdbId: z.number().describe("The TMDB ID of the movie (from search results)"),
    // No quality profile or root folder -- use defaults
  }),
  "safe",
  async (args, context) => {
    if (!context.radarr) {
      return { error: "Movie server (Radarr) is not configured" };
    }

    // 1. Lookup the movie by tmdbId to get full data
    const movie = await context.radarr.lookupByTmdbId(args.tmdbId);

    // 2. Check if already in library
    if (movie.id > 0) {
      return { error: `"${movie.title}" is already in your library` };
    }

    // 3. Apply sensible defaults from cached config
    const qualityProfile = context.radarr.qualityProfiles[0];
    const rootFolder = context.radarr.rootFolders[0];
    if (!qualityProfile || !rootFolder) {
      return { error: "Server configuration incomplete (no quality profiles or root folders)" };
    }

    // 4. POST to Radarr
    const added = await context.radarr.addMovie({
      title: movie.title,
      tmdbId: movie.tmdbId,
      qualityProfileId: qualityProfile.id,
      rootFolderPath: rootFolder.path,
      monitored: true,
      minimumAvailability: "announced",
      addOptions: { searchForMovie: true },
    });

    return {
      success: true,
      title: added.title,
      year: added.year,
      qualityProfile: qualityProfile.name,
      rootFolder: rootFolder.path,
      message: `Added "${added.title} (${added.year})" and searching for downloads`,
    };
  },
);
```

### Pattern 2: Add Series Tool with Monitor Mode Defaults
**What:** Similar to add movie, but for TV series with season monitoring defaults.
**When to use:** For `add_series` tool.

```typescript
export const addSeriesTool = defineTool(
  "add_series",
  "Add a TV show to the wanted/download list. Use the tvdbId from search results. Applies sensible quality, path, and monitoring defaults automatically. Use when the user wants to add, download, get, or request a TV show or series.",
  z.object({
    tvdbId: z.number().describe("The TVDB ID of the series (from search results)"),
  }),
  "safe",
  async (args, context) => {
    if (!context.sonarr) {
      return { error: "TV server (Sonarr) is not configured" };
    }

    // 1. Search by tvdbId to get the full series object
    // Sonarr doesn't have lookupByTvdbId -- use search and filter
    const results = await context.sonarr.searchSeries(`tvdb:${args.tvdbId}`);
    const series = results.find((s) => s.tvdbId === args.tvdbId);
    if (!series) {
      return { error: "Could not find series with that TVDB ID" };
    }

    // 2. Check if already in library
    if (series.id > 0) {
      return { error: `"${series.title}" is already in your library` };
    }

    // 3. Apply sensible defaults
    const qualityProfile = context.sonarr.qualityProfiles[0];
    const rootFolder = context.sonarr.rootFolders[0];
    if (!qualityProfile || !rootFolder) {
      return { error: "Server configuration incomplete" };
    }

    // 4. POST to Sonarr
    const added = await context.sonarr.addSeries({
      title: series.title,
      tvdbId: series.tvdbId,
      qualityProfileId: qualityProfile.id,
      rootFolderPath: rootFolder.path,
      titleSlug: series.titleSlug,
      images: series.images,
      seasons: series.seasons,
      monitored: true,
      seasonFolder: true,
      addOptions: {
        searchForMissingEpisodes: true,
        monitor: "all",
      },
    });

    return {
      success: true,
      title: added.title,
      year: added.year,
      qualityProfile: qualityProfile.name,
      rootFolder: rootFolder.path,
      message: `Added "${added.title} (${added.year})" and searching for episodes`,
    };
  },
);
```

### Pattern 3: Remove Tool with Destructive Confirmation
**What:** A remove tool classified as "destructive" tier, which triggers the existing confirmation interception in `toolCallLoop()`.
**When to use:** For `remove_movie` and `remove_series` tools.

```typescript
export const removeMovieTool = defineTool(
  "remove_movie",
  "Remove a movie from the library. Requires the movie's Radarr ID (not tmdbId). This is a destructive action that requires user confirmation. Use when the user wants to remove, delete, or get rid of a movie from their library.",
  z.object({
    id: z.number().describe("The Radarr ID of the movie to remove"),
    deleteFiles: z.boolean().optional()
      .describe("Whether to also delete downloaded files (default false)"),
  }),
  "destructive",  // <-- triggers confirmation flow
  async (args, context) => {
    if (!context.radarr) {
      return { error: "Movie server (Radarr) is not configured" };
    }

    await context.radarr.removeMovie(args.id, {
      deleteFiles: args.deleteFiles ?? false,
      addImportExclusion: false,
    });

    return {
      success: true,
      message: "Movie removed from library",
      filesDeleted: args.deleteFiles ?? false,
    };
  },
);
```

### Pattern 4: Conversational Context Resolution via System Prompt
**What:** The LLM resolves references like "add that one" or "the second one" by reading previous tool results in conversation history. The system prompt guides this behavior.
**When to use:** Always -- this is the mechanism for LIB-04.

```typescript
// Additional system prompt guidance for library management
const LIBRARY_MANAGEMENT_GUIDELINES = `
Library management:
- When adding media, use the tmdbId (movies) or tvdbId (TV shows) from search results.
- If the user says "add that one", "add it", or references a specific result from a previous search, use the corresponding ID from those results.
- If the user says "the second one" or "number 3", match it to the numbered search results you previously presented.
- For add operations, sensible defaults are applied automatically (first quality profile, first root folder, search enabled). Do not ask the user about quality profiles or root folders.
- Remove operations require the Radarr/Sonarr ID (not tmdbId/tvdbId). You may need to search the library first to find the correct ID.
- Never remove or delete without showing what will be removed and getting confirmation.`;
```

### Pattern 5: Finding Library Items by Title for Removal
**What:** The remove tools need the internal Radarr/Sonarr ID, not the tmdbId/tvdbId. The LLM may need to look up a movie/series in the library first. The existing search tools return `inLibrary` status but not the internal ID. Either: (a) modify search tools to also return the internal ID when `inLibrary=true`, or (b) add a helper mechanism.
**When to use:** For remove operations where the user references a title.

```typescript
// Option A: Extend search results to include library ID
// In search-movies.ts, when inLibrary is true:
const libraryMovie = libraryMovies.find((m) => m.tmdbId === movie.tmdbId);
return {
  // ... existing fields
  inLibrary: true,
  libraryId: libraryMovie?.id ?? null,  // The Radarr ID needed for removal
};

// Option B: Separate lookup - LLM calls getMovies/getSeries to find by title
// Less efficient but doesn't modify existing tools
```

### Anti-Patterns to Avoid
- **Asking the user for quality profile or root folder:** The whole point is "sensible defaults." Use the first cached profile/folder. If there are zero profiles or folders, return an error.
- **Making add tools require the full media object:** The LLM would need to reproduce complex nested objects (images, seasons). Just take the ID and look up the rest server-side.
- **Building custom anaphora resolution:** The LLM already has conversation history. "Add that one" is naturally resolved by the LLM reading its previous tool result. No custom code needed.
- **Using "safe" tier for remove tools:** Removal is destructive. Always use "destructive" tier so the confirmation system kicks in.
- **Forgetting to check if media is already in library before adding:** The Sonarr/Radarr APIs return HTTP 400 if you try to add a duplicate. Better to check first and return a friendly message.
- **Not returning enough info in the add response:** Return title, year, quality profile name, and root folder so the LLM can confirm to the user what was added and where.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Quality profile selection | Custom quality selection UI/logic | `client.qualityProfiles[0]` from cached data | Users don't care about quality profiles via SMS. First profile is the sensible default. |
| Root folder selection | Custom path picker | `client.rootFolders[0]` from cached data | Same reasoning. The admin configured the root folders. Use the first one. |
| Confirmation for destructive actions | Custom confirmation dialog | Existing `ConfirmationTier` + `PendingAction` system | Phase 5 already built this. Tools marked "destructive" are automatically intercepted. |
| Anaphora resolution ("that one") | NLP coreference resolution library | LLM + conversation history + system prompt | Modern LLMs excel at this natively. The conversation history already contains all tool results. |
| Media ID lookup before add | Custom ID resolution service | API lookup calls (`lookupByTmdbId`, `searchSeries`) | The APIs already support lookup by external ID. |
| Duplicate detection | Custom dedup logic | Check `movie.id > 0` after lookup, or catch 400 error | Sonarr/Radarr return id=0 for unmonitored/not-in-library results from search, and id>0 for library items |

**Key insight:** This phase adds 4 tool definitions (thin wrappers around existing client methods), updates the system prompt, and registers the tools in the conversation plugin. The heavy infrastructure (tool framework, confirmation system, conversation history) is already done. The only new logic is default selection from cached config and constructing the API input from lookup results.

## Common Pitfalls

### Pitfall 1: Sonarr Series Lookup by tvdbId
**What goes wrong:** There is no `lookupByTvdbId` method in the Sonarr client (unlike Radarr which has `lookupByTmdbId`). The add_series tool needs the full series object to construct `AddSeriesInput`.
**Why it happens:** Sonarr's API search endpoint accepts `tvdb:` prefix for TVDB ID lookups, but this isn't obvious from the method signature.
**How to avoid:** Use `searchSeries("tvdb:{tvdbId}")` to look up a series by TVDB ID. This returns the same `SeriesLookupResult[]` as a title search. Find the matching result by tvdbId. If the search returns empty, the TVDB ID is invalid.
**Warning signs:** "Could not find series" errors when the user tries to add a show that appeared in search results.

### Pitfall 2: AddSeriesInput Requires Full Season/Image Data
**What goes wrong:** `AddSeriesInput` requires `images`, `seasons`, and `titleSlug` fields that the LLM cannot provide. If the add tool only takes tvdbId, it must fetch this data from a lookup.
**Why it happens:** Sonarr POST /series needs these fields to properly set up the series in its database. Unlike Radarr (which can construct most of this from just the tmdbId), Sonarr expects the client to provide the full series structure.
**How to avoid:** The add_series tool must first search/lookup the series to get the full object, then extract `images`, `seasons`, `titleSlug` from the lookup result and pass them to `addSeries()`.
**Warning signs:** 400 errors from Sonarr about missing required fields.

### Pitfall 3: Cached Config May Be Empty in Degraded Mode
**What goes wrong:** If Sonarr/Radarr was unreachable on startup, the client is registered in "degraded mode" with empty `qualityProfiles[]` and `rootFolders[]`. The add tool tries `profiles[0]` and gets `undefined`.
**Why it happens:** Phase 4 design decision: unreachable server still registers client (methods callable but cache empty).
**How to avoid:** Always check that `qualityProfiles.length > 0` and `rootFolders.length > 0` before using cached data. If empty, try to reload (`loadCachedData()`) or return a clear error: "Server configuration not available. Try again shortly."
**Warning signs:** "Cannot read properties of undefined" errors, or movies/shows added with quality profile 0.

### Pitfall 4: Remove Tool Needs Internal ID, Not External ID
**What goes wrong:** The LLM passes tmdbId/tvdbId to the remove tool, but `removeMovie(id)` and `removeSeries(id)` expect the internal Sonarr/Radarr database ID.
**Why it happens:** Search results from Phase 6 tools return tmdbId/tvdbId (external IDs used for lookups). The internal Radarr/Sonarr ID is different and needed for DELETE calls.
**How to avoid:** Two approaches: (1) Modify existing search tools to include the library ID (`id` field) when `inLibrary=true`. This is the preferred approach since it requires minimal change and makes the remove flow seamless. (2) Have the remove tool search the library by title and find the matching item. Approach 1 is better because it avoids an extra API call and ambiguity.
**Warning signs:** 404 errors from Sonarr/Radarr on DELETE calls, wrong media being removed.

### Pitfall 5: Confirmation Prompt Not Descriptive Enough
**What goes wrong:** The existing confirmation prompt in `toolCallLoop()` says "I'd like to remove_movie with id: 123. Are you sure?" The user has no idea what movie ID 123 is.
**Why it happens:** The generic confirmation prompt in the tool loop uses raw argument key-value pairs.
**How to avoid:** Either: (1) the LLM should include the movie title in its message before the tool call (which the system prompt can instruct), or (2) the remove tool could be made "safe" but have the LLM itself ask for confirmation in natural language before calling it (less reliable), or (3) improve the confirmation prompt to include human-readable details. The best approach for Phase 7: have the LLM describe what it's about to do in natural language before calling the destructive tool. The system prompt already says "Never execute remove/delete without explicit user confirmation" -- this is the LLM's natural behavior. The existing mechanical confirmation is a safety net.
**Warning signs:** Users confirming "yes" to remove something they didn't intend.

### Pitfall 6: Monitor Type Mismatch in AddSeriesInput
**What goes wrong:** The existing `AddSeriesInput` type in `sonarr.types.ts` uses `"lastSeason"` as a monitor option, but the Sonarr API actually uses `"latestSeason"`.
**Why it happens:** The type was defined based on partial API documentation. Some Sonarr versions have used both terms.
**How to avoid:** Verify the monitor enum values against the running Sonarr instance. The safest default is `"all"` (monitor all episodes), which is unambiguous across versions. If updating the type, change `"lastSeason"` to `"latestSeason"`.
**Warning signs:** Sonarr API returning 400 errors when adding series with `"lastSeason"` monitor option.

## Code Examples

Verified patterns from the existing codebase and API documentation.

### Add Movie Tool (Complete)

```typescript
// Source: Existing defineTool pattern + RadarrClient.addMovie() + cached config
import { z } from "zod";
import { defineTool } from "../tools.js";

export const addMovieTool = defineTool(
  "add_movie",
  "Add a movie to the wanted/download list by its TMDB ID. Automatically applies sensible quality and path defaults. Searches for the movie immediately after adding. Use when the user wants to add, download, get, or request a movie.",
  z.object({
    tmdbId: z.number().describe("The TMDB ID of the movie to add (from search_movies results)"),
  }),
  "safe",
  async (args, context) => {
    if (!context.radarr) {
      return { error: "Movie server (Radarr) is not configured" };
    }

    // Lookup the movie to get full data and check if already in library
    const movie = await context.radarr.lookupByTmdbId(args.tmdbId);
    if (movie.id > 0) {
      return {
        alreadyInLibrary: true,
        title: movie.title,
        year: movie.year,
        message: `"${movie.title} (${movie.year})" is already in your library`,
      };
    }

    // Use sensible defaults from cached config
    const qualityProfile = context.radarr.qualityProfiles[0];
    const rootFolder = context.radarr.rootFolders[0];
    if (!qualityProfile || !rootFolder) {
      return { error: "Radarr configuration incomplete (no quality profiles or root folders configured)" };
    }

    const added = await context.radarr.addMovie({
      title: movie.title,
      tmdbId: movie.tmdbId,
      qualityProfileId: qualityProfile.id,
      rootFolderPath: rootFolder.path,
      monitored: true,
      minimumAvailability: "announced",
      addOptions: { searchForMovie: true },
    });

    return {
      success: true,
      title: added.title,
      year: added.year,
      qualityProfile: qualityProfile.name,
      message: `Added "${added.title} (${added.year})" and searching for downloads`,
    };
  },
);
```

### Add Series Tool (Complete)

```typescript
import { z } from "zod";
import { defineTool } from "../tools.js";

export const addSeriesTool = defineTool(
  "add_series",
  "Add a TV show to the wanted/download list by its TVDB ID. Automatically applies sensible quality, path, and monitoring defaults. Searches for missing episodes immediately. Use when the user wants to add, download, get, or request a TV show or series.",
  z.object({
    tvdbId: z.number().describe("The TVDB ID of the series to add (from search_series results)"),
  }),
  "safe",
  async (args, context) => {
    if (!context.sonarr) {
      return { error: "TV server (Sonarr) is not configured" };
    }

    // Sonarr supports tvdb: prefix search for TVDB ID lookup
    const results = await context.sonarr.searchSeries(`tvdb:${args.tvdbId}`);
    const series = results.find((s) => s.tvdbId === args.tvdbId);
    if (!series) {
      return { error: "Could not find series with that TVDB ID" };
    }

    if (series.id > 0) {
      return {
        alreadyInLibrary: true,
        title: series.title,
        year: series.year,
        message: `"${series.title} (${series.year})" is already in your library`,
      };
    }

    const qualityProfile = context.sonarr.qualityProfiles[0];
    const rootFolder = context.sonarr.rootFolders[0];
    if (!qualityProfile || !rootFolder) {
      return { error: "Sonarr configuration incomplete (no quality profiles or root folders configured)" };
    }

    const added = await context.sonarr.addSeries({
      title: series.title,
      tvdbId: series.tvdbId,
      qualityProfileId: qualityProfile.id,
      rootFolderPath: rootFolder.path,
      titleSlug: series.titleSlug,
      images: series.images,
      seasons: series.seasons,
      monitored: true,
      seasonFolder: true,
      addOptions: {
        searchForMissingEpisodes: true,
        monitor: "all",
      },
    });

    return {
      success: true,
      title: added.title,
      year: added.year,
      seasonCount: added.seasons.length,
      qualityProfile: qualityProfile.name,
      message: `Added "${added.title} (${added.year})" with ${added.seasons.length} seasons and searching for episodes`,
    };
  },
);
```

### Remove Movie Tool (Destructive)

```typescript
import { z } from "zod";
import { defineTool } from "../tools.js";

export const removeMovieTool = defineTool(
  "remove_movie",
  "Remove a movie from the library. Uses the Radarr library ID (from search results when inLibrary is true). This is a destructive action requiring user confirmation. Use when the user wants to remove, delete, or unmonitor a movie.",
  z.object({
    id: z.number().describe("The Radarr ID of the movie (the 'libraryId' from search results, NOT the tmdbId)"),
    deleteFiles: z.boolean().optional().describe("Also delete downloaded files (default: false)"),
  }),
  "destructive",
  async (args, context) => {
    if (!context.radarr) {
      return { error: "Movie server (Radarr) is not configured" };
    }

    await context.radarr.removeMovie(args.id, {
      deleteFiles: args.deleteFiles ?? false,
      addImportExclusion: false,
    });

    return {
      success: true,
      message: args.deleteFiles
        ? "Movie removed and files deleted"
        : "Movie removed from library (files kept on disk)",
    };
  },
);
```

### Remove Series Tool (Destructive)

```typescript
import { z } from "zod";
import { defineTool } from "../tools.js";

export const removeSeriesTool = defineTool(
  "remove_series",
  "Remove a TV show from the library. Uses the Sonarr library ID (from search results when inLibrary is true). This is a destructive action requiring user confirmation. Use when the user wants to remove, delete, or unmonitor a TV show.",
  z.object({
    id: z.number().describe("The Sonarr ID of the series (the 'libraryId' from search results, NOT the tvdbId)"),
    deleteFiles: z.boolean().optional().describe("Also delete downloaded files (default: false)"),
  }),
  "destructive",
  async (args, context) => {
    if (!context.sonarr) {
      return { error: "TV server (Sonarr) is not configured" };
    }

    await context.sonarr.removeSeries(args.id, {
      deleteFiles: args.deleteFiles ?? false,
      addImportListExclusion: false,
    });

    return {
      success: true,
      message: args.deleteFiles
        ? "TV show removed and files deleted"
        : "TV show removed from library (files kept on disk)",
    };
  },
);
```

### Search Tool Modification for Library ID

```typescript
// In search-movies.ts, add libraryId to results when inLibrary is true
const libraryMovieMap = new Map(libraryMovies.map((m) => [m.tmdbId, m]));

const results = searchResults.slice(0, 10).map((movie) => {
  const libraryMovie = libraryMovieMap.get(movie.tmdbId);
  return {
    title: movie.title,
    year: movie.year,
    tmdbId: movie.tmdbId,
    overview: movie.overview && movie.overview.length > 150
      ? `${movie.overview.slice(0, 150)}...`
      : movie.overview,
    inLibrary: !!libraryMovie,
    libraryId: libraryMovie?.id ?? null,  // Radarr ID for removal
    status: movie.status,
    studio: movie.studio ?? null,
  };
});
```

### Updated System Prompt Section

```typescript
// Add to SYSTEM_PROMPT in system-prompt.ts
`Library management:
- When the user wants to add media, call add_movie or add_series with the tmdbId or tvdbId from search results.
- If the user refers to a previous search result ("add that one", "the second one", "add it"), use the corresponding tmdbId/tvdbId from those results.
- Sensible defaults are applied automatically for quality profiles and paths. Do not ask the user about these.
- For remove operations, use the libraryId (not tmdbId/tvdbId) from search results where inLibrary is true.
- Always tell the user what was added (title, year) and that a search for downloads has started.
- Remove operations will ask for confirmation automatically. Describe what will be removed before the system asks.`
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom stateful "add wizard" with multi-step prompts | LLM-driven add flow: search -> user picks -> add with defaults | Standard since LLM tool calling (2023+) | No custom state machine needed; the LLM naturally guides the flow |
| Hard-coded default profiles by name | Use first cached quality profile | Standard pattern in arr API wrappers (pyarr, arrapi) | Works for any Sonarr/Radarr setup without knowing profile names |
| Custom NLP for coreference resolution | LLM conversation history + system prompt | Standard since GPT-4 (2023+) | No custom code needed; works out of the box with any tool-calling LLM |
| Separate "confirm" tool or custom confirmation UI | `ConfirmationTier` interceptor in tool call loop | Project-specific (Phase 5) | Destructive tools automatically paused for user confirmation |

**Deprecated/outdated:**
- Building multi-step "add wizards" that ask for quality profile, root folder, monitoring mode step-by-step -- unnecessary with LLM-based defaults
- Custom coreference resolution libraries (spaCy, CoreNLP) for resolving "that one" -- overkill when the LLM already has the conversation context

## Open Questions

1. **Sonarr `tvdb:` prefix search reliability**
   - What we know: Some Sonarr API wrappers (ArrAPI) use `tvdb:{id}` as the search term to look up by TVDB ID. The existing `searchSeries(term)` method passes `term` as a query parameter.
   - What's unclear: Whether all Sonarr versions support the `tvdb:` prefix search syntax. This is the simplest approach but not formally documented.
   - Recommendation: Test with the target Sonarr instance. Fallback: do a regular title search and match by tvdbId from results (less efficient but guaranteed to work). A third option: add a `lookupByTvdbId` method to SonarrClient that uses the series lookup endpoint with `tvdbId` query param if such an endpoint exists.

2. **Monitor type enum correctness**
   - What we know: The existing `AddSeriesInput` type uses `"lastSeason"` but Sonarr source code uses `"latestSeason"` (with `"lastSeason"` possibly being an older alias).
   - What's unclear: Whether current Sonarr v3/v4 accepts `"lastSeason"` as a valid value or returns an error.
   - Recommendation: Use `"all"` as the default monitor mode for add operations (safest, most intuitive for users who want "the whole show"). This sidesteps the enum ambiguity entirely. If needed later, fix the type to use `"latestSeason"`.

3. **Confirmation prompt quality for destructive actions**
   - What we know: The tool loop generates a mechanical confirmation prompt: "I'd like to remove_movie with id: 123. Are you sure?"
   - What's unclear: Whether this is user-friendly enough, or whether the LLM should describe the action in natural language first.
   - Recommendation: The system prompt should instruct the LLM to describe what it's about to do before calling the destructive tool. The mechanical confirmation is a safety net. For Phase 7, this is a prompt-tuning concern, not a code change.

4. **Whether add tools should be "safe" or also require confirmation**
   - What we know: Adding media is not destructive (no data loss). It's an additive operation.
   - What's unclear: Whether users might want to confirm before adding (especially if the wrong movie/show was identified).
   - Recommendation: Make add tools "safe" tier (no confirmation). The LLM should describe what it's adding in its response, and the user can always remove it. This keeps the flow fast and conversational. The user already expressed intent to add by saying "add it."

## Sources

### Primary (HIGH confidence)
- Existing codebase (`src/media/sonarr/sonarr.client.ts`) -- `addSeries()`, `removeSeries()`, `searchSeries()` signatures, `qualityProfiles`/`rootFolders` cache
- Existing codebase (`src/media/radarr/radarr.client.ts`) -- `addMovie()`, `removeMovie()`, `lookupByTmdbId()` signatures, `qualityProfiles`/`rootFolders` cache
- Existing codebase (`src/media/sonarr/sonarr.types.ts`) -- `AddSeriesInput` interface showing required fields
- Existing codebase (`src/media/radarr/radarr.types.ts`) -- `AddMovieInput` interface showing required fields
- Existing codebase (`src/conversation/tool-loop.ts`) -- Destructive tool interception at lines 103-119
- Existing codebase (`src/conversation/confirmation.ts`) -- Pending action CRUD
- Existing codebase (`src/conversation/history.ts`) -- Sliding window preserving tool call results

### Secondary (MEDIUM confidence)
- [pyarr Sonarr docs](https://docs.totaldebug.uk/pyarr/modules/sonarr.html) -- `add_series` method parameters and required fields
- [pyarr Radarr docs](https://docs.totaldebug.uk/pyarr/modules/radarr.html) -- `add_movie` method parameters, minimumAvailability options, monitor types
- [ArrAPI Sonarr source](https://arrapi.kometa.wiki/en/latest/_modules/arrapi/apis/sonarr.html) -- Monitor type enum values: all, future, missing, existing, pilot, firstSeason, latestSeason, none
- [Sonarr GitHub Issue #6175](https://github.com/Sonarr/Sonarr/issues/6175) -- Confirmation that `LatestSeason` (not `lastSeason`) is the correct enum value
- [Radarr GitHub Issue #5881](https://github.com/Radarr/Radarr/issues/5881) -- Radarr API docs note that required fields are not correctly annotated in OpenAPI spec
- [Sonarr forum: V3 API add series example](https://forums.sonarr.tv/t/v3-api-add-series-request-example/33393) -- Confirmation that rootFolderPath is required

### Tertiary (LOW confidence)
- Sonarr `tvdb:` prefix search syntax -- observed in wrapper libraries but not formally documented in Sonarr API docs. Needs runtime verification.
- Whether `"lastSeason"` is still accepted by current Sonarr versions as an alias for `"latestSeason"` -- needs runtime verification.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and tested; no new dependencies
- Architecture: HIGH -- tool definition and registration pattern proven in Phase 6; confirmation system proven in Phase 5; cached config available from Phase 4
- Add tool design: HIGH -- `AddSeriesInput` and `AddMovieInput` interfaces are fully typed; client methods are tested; cached profiles/folders available
- Remove tool design: HIGH -- `removeSeries()` and `removeMovie()` already exist; destructive tier confirmation already works
- Context reference resolution: HIGH -- LLM conversation history already preserves all tool results; this is a standard LLM capability, not a code problem
- Sonarr tvdb: search syntax: LOW -- not formally documented, needs verification
- Monitor type enum: MEDIUM -- `"all"` is the safest default and avoids the `lastSeason`/`latestSeason` ambiguity

**Research date:** 2026-02-13
**Valid until:** 2026-03-15 (30 days -- the tool infrastructure is stable, client APIs are stable, patterns well-established)

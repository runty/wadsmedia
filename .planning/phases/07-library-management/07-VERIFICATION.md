---
phase: 07-library-management
verified: 2026-02-13T00:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 7: Library Management Verification Report

**Phase Goal:** Users can add and remove media from their libraries through natural conversation, including referencing previous search results
**Verified:** 2026-02-13T00:00:00Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | add_movie tool takes a tmdbId, looks up the movie, applies quality/path defaults from cached config, and POSTs to Radarr | ✓ VERIFIED | add-movie.ts lines 16, 27-28, 36-44: lookupByTmdbId, qualityProfiles[0], rootFolders[0], addMovie call with all required fields |
| 2 | add_series tool takes a tvdbId, looks up the series via tvdb: prefix search, applies quality/path defaults from cached config, and POSTs to Sonarr | ✓ VERIFIED | add-series.ts lines 16-17, 32-33, 41-52: searchSeries with tvdb: prefix, qualityProfiles[0], rootFolders[0], addSeries with titleSlug/images/seasons |
| 3 | remove_movie tool takes a Radarr library ID and optional deleteFiles flag, classified as destructive tier | ✓ VERIFIED | remove-movie.ts lines 15, 21-24: destructive tier, id parameter, deleteFiles optional, removeMovie call |
| 4 | remove_series tool takes a Sonarr library ID and optional deleteFiles flag, classified as destructive tier | ✓ VERIFIED | remove-series.ts lines 15, 21-24: destructive tier, id parameter, deleteFiles optional, removeSeries call |
| 5 | Search tools return libraryId when media is already in library, enabling the remove flow | ✓ VERIFIED | search-movies.ts line 19 (Map), line 36 (libraryId); search-series.ts line 19 (Map), line 38 (libraryId) |
| 6 | System prompt instructs the LLM to use tmdbId/tvdbId from search results when adding media | ✓ VERIFIED | system-prompt.ts lines 30-31: "call add_movie with the tmdbId", "call add_series with the tvdbId" |
| 7 | System prompt instructs the LLM to use libraryId (not tmdbId/tvdbId) from search results when removing media | ✓ VERIFIED | system-prompt.ts line 33: "use the libraryId from search results (where inLibrary is true), NOT the tmdbId or tvdbId" |
| 8 | System prompt instructs the LLM to resolve anaphoric references ('add that one', 'the second one') from previous search results | ✓ VERIFIED | system-prompt.ts lines 38-40: "add that one", "add it", "the second one", "number 3", "use the corresponding tmdbId or tvdbId" |
| 9 | All four library management tools are registered in the ToolRegistry alongside existing search tools | ✓ VERIFIED | conversation.ts lines 6-13 (imports), lines 42-45 (registry.register calls for all 4 new tools) |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/conversation/tools/add-movie.ts` | add_movie tool definition | ✓ VERIFIED | 54 lines, exports addMovieTool, safe tier, tmdbId parameter, lookupByTmdbId + addMovie calls |
| `src/conversation/tools/add-series.ts` | add_series tool definition | ✓ VERIFIED | 63 lines, exports addSeriesTool, safe tier, tvdbId parameter, searchSeries + addSeries calls with titleSlug/images/seasons |
| `src/conversation/tools/remove-movie.ts` | remove_movie tool definition with destructive tier | ✓ VERIFIED | 33 lines, exports removeMovieTool, destructive tier, id + deleteFiles parameters, removeMovie call |
| `src/conversation/tools/remove-series.ts` | remove_series tool definition with destructive tier | ✓ VERIFIED | 33 lines, exports removeSeriesTool, destructive tier, id + deleteFiles parameters, removeSeries call |
| `src/conversation/tools/index.ts` | Barrel re-export of all 8 tools | ✓ VERIFIED | 11 lines, exports 8 tools: add (2), remove (2), search (2), upcoming (2) |
| `src/conversation/system-prompt.ts` | Library management guidance in system prompt | ✓ VERIFIED | Contains "Library management:" section (lines 29-35), "Conversational context:" section (lines 37-40) |
| `src/plugins/conversation.ts` | Registration of addMovieTool, addSeriesTool, removeMovieTool, removeSeriesTool | ✓ VERIFIED | Imports all 4 tools (lines 6-13), registers all 4 (lines 42-45), 8 total registry.register calls |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| add-movie.ts | RadarrClient.lookupByTmdbId | context.radarr method call | ✓ WIRED | Line 16: `context.radarr.lookupByTmdbId(args.tmdbId)` |
| add-movie.ts | RadarrClient.addMovie | context.radarr method call | ✓ WIRED | Line 36: `context.radarr.addMovie({...})` with all required fields |
| add-series.ts | SonarrClient.searchSeries | context.sonarr method call with tvdb: prefix | ✓ WIRED | Line 16: `context.sonarr.searchSeries(\`tvdb:${args.tvdbId}\`)` |
| add-series.ts | SonarrClient.addSeries | context.sonarr method call | ✓ WIRED | Line 41: `context.sonarr.addSeries({...})` with titleSlug, images, seasons |
| remove-movie.ts | RadarrClient.removeMovie | context.radarr method call | ✓ WIRED | Line 21: `context.radarr.removeMovie(args.id, {...})` |
| remove-series.ts | SonarrClient.removeSeries | context.sonarr method call | ✓ WIRED | Line 21: `context.sonarr.removeSeries(args.id, {...})` |
| conversation.ts | add-movie.ts | import and registry.register | ✓ WIRED | Line 6 import, line 42 register(addMovieTool) |
| conversation.ts | add-series.ts | import and registry.register | ✓ WIRED | Line 7 import, line 43 register(addSeriesTool) |
| conversation.ts | remove-movie.ts | import and registry.register | ✓ WIRED | Line 10 import, line 44 register(removeMovieTool) |
| conversation.ts | remove-series.ts | import and registry.register | ✓ WIRED | Line 11 import, line 45 register(removeSeriesTool) |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| LIB-01: User can add a movie to wanted list with sensible defaults | ✓ SATISFIED | add_movie tool verified with qualityProfiles[0] and rootFolders[0] defaults |
| LIB-02: User can add a TV show to wanted list with sensible defaults | ✓ SATISFIED | add_series tool verified with qualityProfiles[0] and rootFolders[0] defaults |
| LIB-03: User can remove/unmonitor media via natural language | ✓ SATISFIED | remove_movie and remove_series tools verified with destructive tier |
| LIB-04: User can reference previous conversation context | ✓ SATISFIED | System prompt contains explicit guidance for anaphoric reference resolution |

### Anti-Patterns Found

No anti-patterns detected. All files are substantive implementations:
- No TODO/FIXME/PLACEHOLDER comments
- No empty return statements or stub implementations
- No console.log-only handlers
- All tools have complete error handling and success responses
- TypeScript compilation passes without errors

### Human Verification Required

#### 1. Add Movie End-to-End Flow

**Test:** 
1. Text "search for inception"
2. Wait for search results
3. Text "add it" or "add that one"

**Expected:** 
- LLM calls add_movie with tmdbId from search results
- Tool returns success message with title, year, quality profile
- User receives confirmation that search for downloads has started

**Why human:** Requires live LLM interaction, Radarr instance, and actual conversation flow

#### 2. Add TV Show End-to-End Flow

**Test:**
1. Text "search for breaking bad"
2. Wait for search results  
3. Text "add the first one"

**Expected:**
- LLM calls add_series with tvdbId from search results
- Tool returns success message with title, year, season count, quality profile
- User receives confirmation that search for missing episodes has started

**Why human:** Requires live LLM interaction, Sonarr instance, and actual conversation flow

#### 3. Remove Movie with Confirmation Flow

**Test:**
1. Text "search for a movie already in library"
2. Wait for search results showing "inLibrary: true"
3. Text "remove it"
4. Wait for confirmation prompt
5. Text "yes" to confirm

**Expected:**
- Search results include libraryId for in-library movie
- LLM calls remove_movie with libraryId (not tmdbId)
- Confirmation system intercepts destructive tier and prompts user
- After confirmation, movie is removed from Radarr
- User receives success message

**Why human:** Requires live LLM interaction, Radarr instance with existing content, confirmation flow testing

#### 4. Anaphoric Reference Resolution

**Test:**
1. Text "search for the matrix"
2. Wait for numbered list of results
3. Text "add number 2" or "add the second one"

**Expected:**
- LLM correctly resolves "number 2" to the second search result
- LLM extracts the tmdbId from that result
- add_movie is called with the correct tmdbId

**Why human:** Tests LLM understanding of conversational context, not programmatically verifiable

#### 5. Already in Library Detection

**Test:**
1. Text "add [movie already in library]"

**Expected:**
- LLM searches for the movie
- add_movie tool detects movie.id > 0
- Returns alreadyInLibrary: true with message
- User receives friendly notification that movie is already in library

**Why human:** Requires Radarr instance with existing content

#### 6. Default Quality Profile Application

**Test:**
1. Check Radarr has multiple quality profiles configured
2. Text "add a movie"
3. After it's added, check movie details in Radarr UI

**Expected:**
- Tool uses first quality profile (qualityProfiles[0])
- Tool uses first root folder (rootFolders[0])
- User is NOT asked about quality or path settings

**Why human:** Requires Radarr instance inspection, visual verification of applied settings

### Summary

Phase 7 achieves its goal: **Users can add and remove media from their libraries through natural conversation, including referencing previous search results.**

**Verified capabilities:**
- ✓ All 4 library management tools (add/remove for movies/series) exist and are substantive
- ✓ All tools correctly wired to Radarr/Sonarr client methods
- ✓ Add tools use sensible defaults from cached config (qualityProfiles[0], rootFolders[0])
- ✓ Remove tools use destructive tier to trigger confirmation system
- ✓ Search tools extended with libraryId for remove flow
- ✓ System prompt provides clear guidance for ID usage and context resolution
- ✓ All tools registered in ToolRegistry
- ✓ All requirements (LIB-01 through LIB-04) satisfied
- ✓ TypeScript compilation passes
- ✓ No anti-patterns detected

**Recommended human testing:**
6 end-to-end scenarios covering add/remove flows, confirmation system, anaphoric references, and default application. These require live LLM interaction and running media server instances.

---

_Verified: 2026-02-13T00:00:00Z_
_Verifier: Claude (gsd-verifier)_

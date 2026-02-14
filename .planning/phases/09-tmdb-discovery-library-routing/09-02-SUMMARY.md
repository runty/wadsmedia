---
phase: 09-tmdb-discovery-library-routing
plan: 02
subsystem: api
tags: [brave-search, web-search, fetch, zod, fastify-plugin]

# Dependency graph
requires:
  - phase: 05-conversation-engine
    provides: "defineTool pattern, ToolContext interface, ToolRegistry, conversation engine"
  - phase: 04-media-server-clients
    provides: "ConnectionError, MediaServerError, ValidationError error classes"
provides:
  - "BraveSearchClient class with search method and proper error handling"
  - "web_search LLM tool for vague media query fallback"
  - "Brave Fastify plugin with graceful degradation"
  - "BRAVE_SEARCH_API_KEY optional config variable"
  - "ToolContext.brave field for tool executors"
  - "System prompt web search fallback guidance"
affects: [conversation-engine, system-prompt, tool-context]

# Tech tracking
tech-stack:
  added: []
  patterns: ["External search API client following BraveSearchClient pattern with native fetch"]

key-files:
  created:
    - "src/media/brave/brave.client.ts"
    - "src/media/brave/brave.schemas.ts"
    - "src/media/brave/brave.types.ts"
    - "src/conversation/tools/web-search.ts"
    - "src/plugins/brave.ts"
  modified:
    - "src/conversation/tools/index.ts"
    - "src/conversation/types.ts"
    - "src/config.ts"
    - "src/plugins/conversation.ts"
    - "src/plugins/webhook.ts"
    - "src/conversation/engine.ts"
    - "src/conversation/system-prompt.ts"
    - "src/server.ts"

key-decisions:
  - "Brave Search client uses native fetch with 10s AbortSignal.timeout, matching existing codebase patterns"
  - "web_search tool returns raw title/url/description from Brave with no transformation"
  - "Brave plugin logs warning and returns gracefully when BRAVE_SEARCH_API_KEY not set"

patterns-established:
  - "External search API client: BraveSearchClient pattern with X-Subscription-Token auth, Zod validation, ConnectionError/MediaServerError reuse"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 9 Plan 2: Brave Search Web Fallback Summary

**BraveSearchClient with web_search LLM tool for vague media queries, integrated via Fastify plugin with graceful degradation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T23:18:00Z
- **Completed:** 2026-02-14T23:21:35Z
- **Tasks:** 1
- **Files modified:** 13

## Accomplishments
- BraveSearchClient class with search method, 10s timeout, Zod response validation, and proper error handling (ConnectionError, MediaServerError, ValidationError)
- web_search LLM tool registered in conversation engine, returning title/url/description for each result
- Brave Fastify plugin with graceful skip when BRAVE_SEARCH_API_KEY not configured
- System prompt updated with web search fallback guidance instructing LLM to use web_search for vague descriptions
- ToolContext extended with optional brave field, threaded through engine and webhook

## Task Commits

Each task was committed atomically:

1. **Task 1: Brave Search client and web_search tool with full wiring** - `c409829` (feat)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `src/media/brave/brave.schemas.ts` - Zod schemas for Brave Search API response (BraveSearchResultSchema, BraveSearchResponseSchema)
- `src/media/brave/brave.types.ts` - TypeScript types inferred from Brave schemas
- `src/media/brave/brave.client.ts` - BraveSearchClient class with search method, 10s timeout, error handling
- `src/conversation/tools/web-search.ts` - web_search LLM tool for vague media query fallback
- `src/plugins/brave.ts` - Fastify plugin creating BraveSearchClient and decorating fastify.brave
- `src/conversation/tools/index.ts` - Added webSearchTool barrel export
- `src/conversation/types.ts` - Added brave? field to ToolContext
- `src/config.ts` - Added optional BRAVE_SEARCH_API_KEY env var
- `src/plugins/conversation.ts` - Registered webSearchTool in tool registry
- `src/plugins/webhook.ts` - Passed brave to processConversation context
- `src/conversation/engine.ts` - Added brave to ProcessConversationParams and ToolContext construction
- `src/conversation/system-prompt.ts` - Added web search fallback guidance section
- `src/server.ts` - Registered bravePlugin in server plugin chain

## Decisions Made
- Brave Search client uses native fetch() with 10s AbortSignal.timeout, matching the zero-dependency convention used by Sonarr/Radarr clients
- web_search tool returns raw title/url/description from Brave results with no transformation -- simple and sufficient for LLM to identify media titles
- Brave plugin follows exact same pattern as sonarr.ts: graceful skip with log warning when unconfigured, decorate on fastify instance when configured

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - 09-01 ran in parallel modifying shared files (config.ts, types.ts, tools/index.ts, conversation.ts, engine.ts, webhook.ts, server.ts). All modifications were additive and non-conflicting as anticipated in the plan.

## User Setup Required

**External services require manual configuration:**
- **BRAVE_SEARCH_API_KEY**: Brave Search API subscription token from https://api-dashboard.search.brave.com -> API Keys
- Without this key, the app starts normally but web_search tool returns an error message to the LLM

## Next Phase Readiness
- web_search tool ready for use alongside discover_media (09-01) and library routing (09-03)
- Total tool count: 12 (10 existing + discover_media from 09-01 + web_search from 09-02)
- System prompt guides LLM on when to use web_search vs structured search

## Self-Check: PASSED

- All 6 created files found on disk
- Commit c409829 verified in git log
- TypeScript compilation: zero errors
- Biome lint on plan files: zero errors

---
*Phase: 09-tmdb-discovery-library-routing*
*Completed: 2026-02-14*

---
phase: 11-plex-tautulli-integration
plan: 02
subsystem: api
tags: [tautulli, fastify-plugin, zod, watch-history, llm-tool]

# Dependency graph
requires:
  - phase: 04-media-server-clients
    provides: "Error classes (MediaServerError, ConnectionError, ValidationError), apiRequest pattern"
  - phase: 05-conversation-engine
    provides: "defineTool, ToolRegistry, ToolContext, processConversation, system-prompt"
  - phase: 11-plex-tautulli-integration/01
    provides: "TAUTULLI_URL/TAUTULLI_API_KEY in config, tautulli field in ToolContext"
provides:
  - "TautulliClient with getHistory, getUsers, getUserWatchTimeStats, healthCheck"
  - "tautulliRequest HTTP helper with apikey query param auth, cmd-based API, response.result wrapper validation"
  - "get_watch_history LLM tool (tool #14) for querying recent Plex watch activity"
  - "Fastify tautulli plugin with graceful degradation"
  - "Zod schemas for Tautulli history items, users, watch time stats"
affects: [12-user-linking]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Tautulli API wrapper: apikey query param + cmd param + response.result success check (HTTP 200 always returned)"]

key-files:
  created:
    - src/media/tautulli/tautulli.http.ts
    - src/media/tautulli/tautulli.schemas.ts
    - src/media/tautulli/tautulli.types.ts
    - src/media/tautulli/tautulli.client.ts
    - src/plugins/tautulli.ts
    - src/conversation/tools/get-watch-history.ts
  modified:
    - src/conversation/types.ts
    - src/conversation/engine.ts
    - src/plugins/webhook.ts
    - src/plugins/conversation.ts
    - src/conversation/tools/index.ts
    - src/server.ts
    - src/conversation/system-prompt.ts

key-decisions:
  - "Tautulli response.result wrapper validation: always HTTP 200, success determined by response.result field"
  - "Global watch history in Phase 11 (no userId filter); per-user filtering deferred to Phase 12 user linking"
  - "get_watch_history returns full_title, media_type, date, duration, friendly_name, platform, player, percent_complete"

patterns-established:
  - "Tautulli HTTP helper: apikey query param auth + cmd query param (distinct from Plex X-Plex-Token header and TMDB Bearer auth)"
  - "Response wrapper validation: parse outer envelope first, check result field, then validate inner data"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 11 Plan 02: Tautulli Watch History Summary

**TautulliClient with watch history API, get_watch_history LLM tool (#14), and Fastify plugin with graceful degradation**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T00:29:13Z
- **Completed:** 2026-02-15T00:32:36Z
- **Tasks:** 2
- **Files modified:** 15 (6 created, 9 modified)

## Accomplishments
- TautulliClient class with getHistory, getUsers, getUserWatchTimeStats, and healthCheck methods using cmd-based API with apikey query param auth
- get_watch_history LLM tool (tool #14, total count 14/15 limit) with media type filtering and configurable limit
- Fastify tautulli plugin with graceful degradation when TAUTULLI_URL/TAUTULLI_API_KEY are not set
- Full server wiring: ToolContext updated with proper TautulliClient type, engine params threaded, webhook passthrough, plugin registration, system prompt guidance

## Task Commits

Each task was committed atomically:

1. **Task 1: Tautulli HTTP helper, Zod schemas, types, and TautulliClient class** - `dd34c65` (feat)
2. **Task 2: Tautulli Fastify plugin, get_watch_history tool, and server wiring** - `6d412ed` (feat)

## Files Created/Modified
- `src/media/tautulli/tautulli.http.ts` - Tautulli HTTP helper with apikey query param, cmd parameter, response.result wrapper validation
- `src/media/tautulli/tautulli.schemas.ts` - Zod schemas for history items, users, watch time stats
- `src/media/tautulli/tautulli.types.ts` - TypeScript types inferred from Zod schemas
- `src/media/tautulli/tautulli.client.ts` - TautulliClient with getHistory, getUsers, getUserWatchTimeStats, healthCheck
- `src/plugins/tautulli.ts` - Fastify plugin with health check and graceful degradation
- `src/conversation/tools/get-watch-history.ts` - get_watch_history LLM tool for querying recent watch activity
- `src/conversation/types.ts` - Updated tautulli field from `unknown` to proper `TautulliClient` import type
- `src/conversation/engine.ts` - Added TautulliClient to params and both context objects
- `src/plugins/webhook.ts` - Added tautulli passthrough to processConversation call
- `src/plugins/conversation.ts` - Imported and registered getWatchHistoryTool
- `src/conversation/tools/index.ts` - Added getWatchHistoryTool export
- `src/server.ts` - Imported and registered tautulliPlugin
- `src/conversation/system-prompt.ts` - Added watch history guidance section

## Decisions Made
- Tautulli API always returns HTTP 200 even on errors; success is determined by `response.result === "success"` in the wrapper. The HTTP helper validates this wrapper before validating the inner data.
- Global watch history for Phase 11 (no per-user filtering); Phase 12 user linking will add userId-based filtering
- Watch history response maps key fields (full_title, media_type, date, duration, friendly_name, platform, player, percent_complete) for LLM consumption

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration.** The following environment variables must be set:

- `TAUTULLI_URL` - Your Tautulli URL (e.g., `http://192.168.1.100:8181`)
- `TAUTULLI_API_KEY` - Tautulli API key from Settings -> Web Interface -> API key

**Verification:** After setting env vars, start the server and check logs for "Tautulli configured". Then text "what have I been watching?" to get recent watch history.

## Next Phase Readiness
- Phase 11 complete: both Plex library awareness and Tautulli watch history are fully integrated
- 14 tools registered (under 15 limit), ready for Phase 12 user linking
- Phase 12 can add per-user watch history filtering by passing userId to getHistory()

## Self-Check: PASSED

All 6 created files verified on disk. Both task commits (dd34c65, 6d412ed) verified in git log.

---
*Phase: 11-plex-tautulli-integration*
*Completed: 2026-02-15*

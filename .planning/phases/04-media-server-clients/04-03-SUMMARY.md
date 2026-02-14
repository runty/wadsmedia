---
phase: 04-media-server-clients
plan: 03
subsystem: api
tags: [fastify-plugin, sonarr, radarr, graceful-degradation, decorator, caching]

# Dependency graph
requires:
  - phase: 04-media-server-clients
    plan: 01
    provides: "SonarrClient class with getQualityProfiles and getRootFolders methods"
  - phase: 04-media-server-clients
    plan: 02
    provides: "RadarrClient class with getQualityProfiles and getRootFolders methods"
  - phase: 01-foundation
    provides: "Fastify server, config schema with SONARR_URL/RADARR_URL env vars, plugin pattern"
provides:
  - "Fastify sonarr plugin that decorates fastify.sonarr with cached quality profiles and root folders"
  - "Fastify radarr plugin that decorates fastify.radarr with cached quality profiles and root folders"
  - "Graceful degradation: app starts even when media servers are unconfigured or unreachable"
  - "loadCachedData() on both SonarrClient and RadarrClient for startup data prefetch"
affects: [05-conversation-engine, 06-search-service, 07-library-management]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Fastify plugin with optional decorator (skip when not configured, degrade when unreachable)", "Startup cache pattern: load config data once, expose as client properties"]

key-files:
  created:
    - src/plugins/sonarr.ts
    - src/plugins/radarr.ts
  modified:
    - src/media/sonarr/sonarr.client.ts
    - src/media/radarr/radarr.client.ts
    - src/server.ts

key-decisions:
  - "Optional decorator type (sonarr?: SonarrClient) so downstream code must null-check before use"
  - "Plugin depends on database plugin (consistent with infrastructure ordering) even though no direct DB use"
  - "Unreachable server on startup still registers client in degraded mode (empty cache, methods still callable)"

patterns-established:
  - "Optional Fastify decorator pattern: plugin skips registration gracefully when env vars missing, logs warning"
  - "Degraded mode pattern: catch startup errors, log error, register client with empty cache, do not crash"

# Metrics
duration: 1min
completed: 2026-02-14
---

# Phase 4 Plan 3: Fastify Plugins Summary

**Sonarr and Radarr Fastify plugins with startup caching of quality profiles and root folders, graceful skip when unconfigured, and degraded-mode registration when servers are unreachable**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-14T03:12:03Z
- **Completed:** 2026-02-14T03:13:24Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- SonarrClient and RadarrClient gain loadCachedData() method and qualityProfiles/rootFolders properties for startup prefetch
- Fastify plugins for both clients with three-tier resilience: skip if unconfigured, degrade if unreachable, full cache if healthy
- Server.ts registers sonarr and radarr plugins in correct order (after database/health, before messaging)
- Full build passes: tsc --noEmit, biome check, npm run build all clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Add cached data methods and create Fastify plugins** - `971189c` (feat)
2. **Task 2: Wire plugins into server.ts and verify full build** - `4f2cb6f` (feat)

## Files Created/Modified
- `src/plugins/sonarr.ts` - Fastify plugin: creates SonarrClient, caches profiles/folders, decorates fastify.sonarr with optional type
- `src/plugins/radarr.ts` - Fastify plugin: creates RadarrClient, caches profiles/folders, decorates fastify.radarr with optional type
- `src/media/sonarr/sonarr.client.ts` - Added qualityProfiles/rootFolders properties and loadCachedData() method
- `src/media/radarr/radarr.client.ts` - Added qualityProfiles/rootFolders properties and loadCachedData() method
- `src/server.ts` - Added sonarrPlugin and radarrPlugin imports and registration

## Decisions Made
- **Optional decorator type:** Used `sonarr?: SonarrClient` (not `sonarr: SonarrClient`) in FastifyInstance augmentation because plugin may skip registration when not configured. Downstream code must check `if (!fastify.sonarr)` before use.
- **Database dependency:** Both plugins declare `dependencies: ["database"]` for consistent infrastructure ordering, even though they don't directly use the database.
- **Degraded mode on unreachable:** When loadCachedData() throws, the error is logged but the client is still decorated on fastify. This means API methods remain callable (will fail individually) and the cache can be refreshed later if needed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Sonarr/Radarr env vars are already optional in the config schema.

## Next Phase Readiness
- Phase 4 (Media Server Clients) is fully complete: HTTP utility, error types, Sonarr client, Radarr client, and Fastify plugins all integrated
- fastify.sonarr and fastify.radarr available for use in Phase 5 (Conversation Engine) tool definitions
- Quality profiles and root folders pre-cached for use in add-series/add-movie flows
- Application starts cleanly with or without media server configuration

## Self-Check: PASSED

All 2 created files verified on disk. Both modified client files contain loadCachedData(). server.ts contains both plugin registrations. Both task commits (971189c, 4f2cb6f) verified in git log.

---
*Phase: 04-media-server-clients*
*Completed: 2026-02-14*

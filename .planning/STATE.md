# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** Users can manage their media libraries through natural conversation -- text a message, get things done, no UI to learn.
**Current focus:** Phase 13 -- RCS Rich Messaging & Personality

## Current Position

Phase: 13 of 13 (RCS Rich Messaging & Personality)
Plan: 1 of 2 in current phase
Status: Executing phase 13
Last activity: 2026-02-15 -- 13-01 complete (RCS rich messaging infrastructure)

Progress: [###############################] 31/32 plans

## Performance Metrics

**v1.0 Velocity:**
- Total plans completed: 31
- Average duration: 3min
- Total execution time: 1.20 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3 | 12min | 4min |
| 02-messaging-gateway | 2 | 4min | 2min |
| 03-user-management | 2 | 4min | 2min |
| 04-media-server-clients | 3 | 5min | 2min |
| 05-conversation-engine | 3 | 9min | 3min |
| 06-search-and-discovery | 2 | 3min | 2min |
| 07-library-management | 2 | 3min | 2min |
| 08-status-and-notifications | 2 | 4min | 2min |
| 09-tmdb-discovery-library-routing | 3 | 14min | 5min |
| 10-permissions-user-tracking | 1 | 4min | 4min |
| 11-plex-tautulli-integration | 2 | 6min | 3min |
| 12-web-admin-dashboard | 3 | 6min | 2min |
| 13-rcs-rich-messaging-personality | 1 | 2min | 2min |

## Accumulated Context

### Decisions

Decisions archived in PROJECT.md Key Decisions table.
Recent decisions affecting v2.0:

- Tool consolidation: keep total LLM tool count under 15 (enhance existing tools, do not proliferate)
- Zero-dependency API clients: TMDB/Plex/Tautulli via native fetch() following existing apiRequest pattern
- Permission enforcement at execution layer, not system prompt
- RCS brand onboarding: start early (4-6 week approval timeline)
- Brave Search client uses native fetch with X-Subscription-Token auth, 10s timeout, Zod validation
- web_search tool returns raw title/url/description; LLM uses results to identify media titles
- TMDB HTTP helper uses Bearer auth (separate from Sonarr/Radarr X-Api-Key helper)
- Single discover_media tool covers movie + TV discovery (compound tool pattern keeps tool count low)
- Pure routing functions for library routing (no API calls, maximizes testability)
- Dual-format language matching (ISO codes + full names) for TMDB/Radarr compatibility
- Config added to ToolContext (not imported directly) for routing hint access
- requiredRole on ToolDefinition with 'any' default: centralized permission gating without modifying existing tools
- Admin notification fire-and-forget: add succeeds even if Twilio is down
- media_tracking stores tmdbId/tvdbId; mediaType column disambiguates ID system
- Plex GUID regex parsing for provider-agnostic cache keys (tmdb:ID, tvdb:ID, imdb:ID)
- Async non-blocking cache load on startup with 15min periodic refresh
- Tautulli config vars and ToolContext field pre-added in 11-01 to avoid config churn in 11-02
- Tautulli API always returns HTTP 200; success determined by response.result wrapper field
- Global watch history in Phase 11 (no userId filter); per-user filtering deferred to Phase 12
- Admin dashboard opt-in via ADMIN_SESSION_SECRET + ADMIN_PASSWORD; plugin skips registration when not set
- Dockerfile COPY paths use repo-root admin-views/admin-assets/ matching process.cwd() in plugin
- Route generics on fastify.get<T>()/post<T>() for Fastify 5 strict typing compatibility
- Per-user watch history: tool queries plexUserId from DB at execution time (not in ToolContext) for simplicity
- Native fetch() for Twilio Content API (SDK lacks card creation helpers); follows zero-dependency pattern
- Idempotent ensureSearchResultTemplate (list-then-create) as primary engine entry point for template management
- Quick-reply buttons under 20-char RCS limit: "Add this" / "Next result" / "Check Plex"

### Pending Todos

- Start RCS brand onboarding with Twilio as early as possible (blocks Phase 13 sending)

### Blockers/Concerns

- Plex API docs are sparse; community resources are MEDIUM confidence (plan verification step in Phase 11)
- RCS brand approval for homelab projects is uncertain; SMS/MMS fallback is functional alternative

## Session Continuity

Last session: 2026-02-15
Stopped at: Completed 13-01-PLAN.md (RCS rich messaging infrastructure)
Resume file: None

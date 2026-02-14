# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-13)

**Core value:** Users can manage their media libraries through natural conversation -- text a message, get things done, no UI to learn.
**Current focus:** Phase 4: Media Server Clients

## Current Position

Phase: 4 of 8 (Media Server Clients)
Plan: 2 of 3 in current phase
Status: In Progress
Last activity: 2026-02-14 -- Plan 04-02 complete (Radarr client with 9 API methods)

Progress: [█████░░░░░] 47%

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: 3min
- Total execution time: 0.4 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 3 | 12min | 4min |
| 02-messaging-gateway | 2 | 4min | 2min |
| 03-user-management | 2 | 4min | 2min |
| 04-media-server-clients | 2 | 4min | 2min |

**Recent Trend:**
- Last 5 plans: 02-02 (2min), 03-01 (2min), 03-02 (2min), 04-01 (3min), 04-02 (1min)
- Trend: Stable

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 8 phases derived from 34 requirements -- Foundation, Messaging, Users, Media Clients, LLM, Search, Library, Status
- [Roadmap]: Phases 4 and 5 can run in parallel (media clients and conversation engine are independent)
- [Roadmap]: Phase 5 (Conversation Engine) flagged for potential deeper research on prompt engineering and tool schema design
- [01-01]: Biome v2.3 config schema differs from v1.x docs -- uses assist.actions.source.organizeImports and files.includes with !! double-exclude
- [01-01]: Excluded .claude/ and .planning/ from Biome to avoid linting GSD tooling files
- [01-01]: Fastify bundles its own Pino -- do not install Pino as direct dependency
- [01-02]: Exported DatabaseConnection interface to satisfy TypeScript declaration emit with verbatimModuleSyntax
- [01-02]: Un-ignored drizzle/ from .gitignore -- migration SQL files must be tracked for runtime migrate() and Docker COPY
- [01-02]: Migration path resolved via import.meta.url for portability between tsx dev and compiled dist/
- [01-03]: Health check uses SQL SELECT 1 for genuine database connectivity verification
- [01-03]: Docker HEALTHCHECK uses Node.js fetch (not curl) to avoid installing curl in slim image
- [01-03]: Named volume wadsmedia-data at /data for SQLite persistence across container restarts
- [02-01]: Destructure twiml and validateRequest from default twilio import (CJS named exports fail in ESM)
- [02-01]: OutboundMessage supports both messagingServiceSid (RCS fallback) and direct from-number patterns
- [02-02]: Keep Twilio env vars optional in Zod schema; validate at messaging plugin registration time for backward compat
- [02-02]: Reconstruct webhook URL from x-forwarded-proto and host headers for signature validation behind reverse proxy
- [03-01]: User service uses pure functions with db parameter (dependency injection), consistent with codebase pattern
- [03-01]: resolveUser exposed via fastify.decorate for route-level preHandler usage (not a global hook)
- [03-01]: Admin phone seeded before whitelist; whitelist entries matching admin phone skipped to preserve isAdmin flag
- [03-02]: displayName null/empty/non-empty used as onboarding state sentinel values (no extra DB columns needed)
- [03-02]: ADMIN_PHONE made required in config (breaking change, acceptable pre-release) for admin notification guarantee
- [03-02]: Active users get placeholder acknowledgment; conversation logic deferred to Phase 5
- [04-01]: SeriesSchema aliased to SeriesLookupSchema (identical shape, id becomes non-zero after POST)
- [04-01]: 30s timeout for search operations (proxies to TheTVDB), 10s default for CRUD
- [04-01]: Separate apiRequestVoid for DELETE operations avoids awkward schema parameter on void responses
- [04-02]: MovieLookupSchema reused for Movie alias (identical shape, id non-zero after POST) -- same pattern as Sonarr
- [04-02]: 30s timeout for searchMovies/lookupByTmdbId (proxies to TMDB), 10s default for CRUD
- [04-02]: Radarr uses addImportExclusion (not addImportListExclusion like Sonarr) per API docs

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 5: LLM provider compatibility (strict function calling mode) needs verification across OpenAI, Anthropic, Ollama during implementation
- Phase 4: Sonarr/Radarr API version resolved -- both use /api/v3/ regardless of application version (confirmed in research)

## Session Continuity

Last session: 2026-02-14
Stopped at: Completed 04-02-PLAN.md (Radarr client), ready for 04-03-PLAN.md (Fastify plugins)
Resume file: None

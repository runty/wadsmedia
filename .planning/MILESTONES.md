# Milestones

## v1.0 MVP (Shipped: 2026-02-14)

**Phases completed:** 8 phases, 19 plans, 0 tasks

**Key accomplishments:**
- Fastify 5 + TypeScript strict ESM server with SQLite/Drizzle ORM, Docker multi-stage build, and structured Pino logging
- Twilio RCS/SMS messaging gateway with signature validation and provider-agnostic interface
- Phone-based user management with admin designation, whitelist authorization, and conversational onboarding
- Typed Sonarr and Radarr API clients with Zod validation, config caching, and graceful degradation
- LLM-powered conversation engine with tool calling, sliding window history, and destructive action confirmation
- 9 LLM tools for search, library management, and download status, plus proactive notification webhooks

---


## v2.0 Smart Discovery & Admin (Shipped: 2026-02-15)

**Phases completed:** 5 phases (9-13), 11 plans
**Commits:** 53 (20 feat) | **Lines:** +52,796 / -1,454 | **Codebase:** 6,137 LOC TypeScript (80 files)

**Key accomplishments:**
- TMDB-powered media discovery with structured search (actor, genre, year, network) and Brave Search fallback for vague queries
- Smart library routing: auto-detect anime series and Asian-language movies for correct Sonarr/Radarr folder placement
- Role-based permissions with code-level enforcement, admin notifications, and per-user media tracking
- Plex library awareness with O(1) GUID-indexed cache and Tautulli watch history (global + per-user)
- Web admin dashboard with session auth, user management, chat history viewer, Plex user linking, and system health
- RCS rich messaging infrastructure with content templates, quick-reply buttons, and fun assistant personality

---


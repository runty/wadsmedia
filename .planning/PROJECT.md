# WadsMedia

## What This Is

A Docker-based conversational media assistant that lets users manage their Sonarr, Radarr, and Plex media libraries through natural language text messages. Users text the app via Twilio SMS/MMS, an LLM interprets the intent, and the app executes the appropriate actions -- discovering media via TMDB and web search, checking Plex for existing content, adding shows/movies with smart library routing (anime/Asian-language auto-detection), checking download progress, viewing upcoming schedules, browsing watch history via Tautulli, and receiving proactive notifications. An admin web dashboard provides user management, chat history viewing, Plex user linking, and system health monitoring.

## Core Value

Users can manage their media libraries through natural conversation -- text a message, get things done, no UI to learn.

## Requirements

### Validated

- ✓ Natural language messaging interface to Sonarr and Radarr -- v1.0
- ✓ Modular, configurable messaging provider (Twilio RCS/SMS) -- v1.0
- ✓ Configurable LLM provider (OpenAI-compatible API) -- v1.0
- ✓ Search for shows/movies by name -- v1.0
- ✓ Add shows/movies to wanted list -- v1.0
- ✓ Remove shows/movies from wanted list -- v1.0
- ✓ View upcoming episode/movie schedule -- v1.0
- ✓ Check download status -- v1.0
- ✓ Smart ambiguity handling (auto-pick if confident, ask user if close matches) -- v1.0
- ✓ Full conversation history per user -- v1.0
- ✓ Multi-user support via phone number whitelist -- v1.0
- ✓ Proactive notifications (downloads complete, new episodes available) -- v1.0
- ✓ Sonarr API integration -- v1.0
- ✓ Radarr API integration -- v1.0
- ✓ Docker deployment with environment variable configuration -- v1.0
- ✓ Smart discovery via TMDB API with structured search (actor, network, genre, year) and web search fallback for vague queries -- v2.0
- ✓ Plex integration to check if media already exists in user's library (seasons/episodes for TV) -- v2.0
- ✓ Tautulli integration for watch history awareness and user activity tracking -- v2.0
- ✓ Default to 1080p quality profile, only change when user explicitly requests different quality -- v2.0
- ✓ Smart library routing for Sonarr: auto-detect anime from metadata, route to anime folder vs TV folder -- v2.0
- ✓ Smart library routing for Radarr: auto-detect Asian-language movies, route to CMovies folder vs Movies folder -- v2.0
- ✓ Role-based permissions: non-admins can search, add, view status/upcoming, but cannot remove media -- v2.0
- ✓ Admin notification when non-admin user adds a show or movie -- v2.0
- ✓ Per-user media tracking: record which user added which shows/movies -- v2.0
- ✓ Web admin dashboard with user management and chat history viewer -- v2.0
- ✓ Plex user linking in web admin interface -- v2.0
- ✓ Dashboard stats: request counts, recent activity, system health -- v2.0
- ✓ RCS rich cards with posters for search results -- v2.0
- ✓ RCS suggested reply buttons for quick actions ("Add this", "Next result") -- v2.0
- ✓ Fun, edgy, slightly spicy assistant personality with emojis -- v2.0
- ✓ Telegram bot integration with DM and group chat support -- v2.1
- ✓ Telegram inline keyboards for quick actions -- v2.1
- ✓ Telegram poster images in search results -- v2.1
- ✓ Telegram group chat with shared context and @mention detection -- v2.1
- ✓ Telegram user identity resolution and WadsMedia user linking -- v2.1
- ✓ Configurable MMS pixel URL -- v2.1
- ✓ Admin dashboard UX improvements for Plex user linking discoverability -- v2.1
- ✓ Admin user approval/blocking via SMS and Telegram LLM tools -- v2.1

### Active

- [ ] Conversation resilience: error recovery, deferred message persistence, webhook reconnection
- [ ] LLM response quality: history pruning, context management, reduce confused responses
- [ ] Notification reliability: delivery confirmation, formatting, timing
- [ ] Admin experience: user management tools in dashboard, monitoring improvements

### Out of Scope

- Mobile app -- messaging-first, no native app needed
- Self-serve signup -- admin whitelists users via web dashboard
- Lidarr/Readarr integration -- Sonarr + Radarr only, architecture allows adding more later
- Media playback -- this manages the library, not the player
- Voice interface -- text messaging is the sweet spot
- Per-user request quotas -- whitelisted users are trusted
- OAuth/SSO for web dashboard -- simple auth sufficient for admin-only interface

## Current Milestone: v2.2 Stability & Polish

**Goal:** Harden conversation reliability, improve LLM response quality, polish notifications and admin experience.

**Target features:**
- Conversation resilience (error recovery, webhook reconnection, deferred message persistence)
- LLM context quality (history pruning, reducing confused/repetitive responses)
- Notification improvements (formatting, delivery reliability)
- Admin experience polish (dashboard integration of new tools, monitoring)

## Context

Shipped v2.0 with 6,137 LOC TypeScript across 80 source files.

Tech stack: Node.js 22, TypeScript (strict ESM), Fastify 5, SQLite via better-sqlite3 + Drizzle ORM, OpenAI SDK v6, Twilio SDK v5, Zod 4, Biome 2.3, Eta templates, htmx 2.0, Docker multi-stage build.

Architecture: Twilio webhook -> user resolution -> onboarding or LLM conversation engine -> tool call loop -> media API clients (Sonarr/Radarr/TMDB/Plex/Tautulli/Brave Search). Proactive notifications via Sonarr/Radarr webhook receivers with template-based SMS dispatch. Admin dashboard via Fastify plugin with session-based auth and Eta/htmx UI.

16 LLM tools: search_series, search_movies, add_series, add_movie, remove_series, remove_movie, get_download_queue, get_upcoming_episodes, get_upcoming_movies, discover_media, web_search, check_plex_library, get_watch_history, check_status, list_pending_users, manage_user.

Key patterns: fire-and-forget webhook response (avoids Twilio 15s timeout), sliding window conversation history (last 20 messages with atomic tool call pairs), destructive action confirmation via pending actions table, graceful degradation when media servers unavailable, O(1) Plex library cache with GUID-indexed lookups, smart library routing via pure functions, MMS for long messages (>300 chars).

Known issues from live testing:
- RCS rich cards require brand approval (disabled, SMS/MMS fallback active)
- LLM sometimes guesses wrong media type (movie vs show) -- mitigated with type-agnostic Plex fallback search
- LLM (gpt-4o-mini) sometimes gives confused responses when history has many consecutive user messages
- Telegram webhook stops delivering after server downtime until tunnel is re-established
- Admin user management tools (list_pending_users, manage_user) added outside GSD, need dashboard integration

## Constraints

- **Deployment**: Must run as Docker container(s)
- **Configuration**: Environment variables for all settings (API keys, server URLs, whitelist)
- **LLM compatibility**: Must work with any OpenAI-compatible API endpoint
- **Messaging modularity**: Provider interface must be abstract enough to swap implementations

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Twilio RCS as initial messaging provider | Rich messaging support, reliable API | ✓ Good -- works well for SMS/RCS |
| OpenAI-compatible LLM interface | Allows using any compatible provider (OpenAI, local models, etc.) | ✓ Good -- confirmed with Ollama/LM Studio support |
| Phone number whitelist for auth | Simple, fits messaging-first model, no passwords needed | ✓ Good -- conversational onboarding works naturally |
| Environment variables for config | Standard Docker pattern, simple deployment | ✓ Good |
| Full conversation history | Enables contextual follow-ups ("add that one too") | ✓ Good -- anaphoric references work via system prompt guidance |
| Fastify 5 + strict ESM | Modern Node.js server framework with built-in Pino | ✓ Good -- plugin architecture scales well |
| SQLite + Drizzle ORM | Simple deployment (no separate DB), type-safe queries | ✓ Good -- WAL mode handles concurrent access |
| Fire-and-forget webhook pattern | Avoids Twilio 15s timeout on LLM processing | ✓ Good -- essential for tool call loops |
| Template-based notifications (not LLM) | Speed, cost, and predictability for proactive messages | ✓ Good -- instant delivery, no LLM latency |
| Zod v4 native toJSONSchema() | Tool parameter schemas without external dependency | ✓ Good -- draft-7 target works across providers |
| Sliding window (20 messages) with atomic tool pairs | Bounded context cost while preserving tool call integrity | ✓ Good |
| Destructive action confirmation via DB | Pending actions with 5-min expiry, yes/no detection | ✓ Good -- simple state machine |
| Zero-dependency API clients (TMDB/Plex/Tautulli/Brave) | Native fetch() keeps bundle small, follows apiRequest pattern | ✓ Good -- consistent pattern across all clients |
| Tool consolidation under 15 | Compound tools (discover_media) keep LLM context clean | ✓ Good -- 14 tools total, no proliferation |
| Permission enforcement at execution layer | requiredRole on ToolDefinition, not system prompt guidance | ✓ Good -- code-level guarantee |
| Pure routing functions for library routing | No API calls in routing logic, maximizes testability | ✓ Good -- easily unit tested |
| Plex GUID-indexed in-memory cache | O(1) lookups by TMDB/TVDB/IMDB ID with 15min refresh | ✓ Good -- fast, reliable |
| Admin dashboard opt-in via env vars | ADMIN_SESSION_SECRET + ADMIN_PASSWORD, skips if not set | ✓ Good -- zero overhead when disabled |
| Eta + htmx for admin UI | Server-rendered, no build step, lightweight | ✓ Good -- simple and functional |
| MMS for long messages via pixel.png | Transparent pixel forces MMS mode for messages >300 chars | ✓ Good -- now configurable via MMS_PIXEL_URL |
| RCS rich cards via Content Templates | Poster images, quick-reply buttons | ⚠️ Revisit -- requires brand approval, currently disabled |
| Deferred user message persistence | Save user message to DB only after LLM responds successfully | ✓ Good -- prevents orphaned messages on error |
| Admin user management via LLM tools | Approve/block users from SMS/Telegram instead of dashboard only | ✓ Good -- natural workflow for admin |

---
*Last updated: 2026-02-15 after v2.2 milestone started*

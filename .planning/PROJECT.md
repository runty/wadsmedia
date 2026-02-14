# WadsMedia

## What This Is

A Docker-based conversational gateway that lets users manage their Sonarr and Radarr media servers through natural language text messages. Users text the app via Twilio RCS/SMS, an LLM interprets the intent, and the app executes the appropriate API calls -- searching for shows/movies, adding them to wanted lists, removing media, checking download progress, viewing upcoming schedules, and receiving proactive notifications when downloads complete.

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

### Active

(None -- define for next milestone with `/gsd:new-milestone`)

### Out of Scope

- Mobile app -- messaging-first, no native app needed
- Web dashboard -- management happens through conversation
- Self-serve signup -- admin whitelists users
- Lidarr/Readarr integration -- Sonarr + Radarr only for v1, architecture allows adding more later
- Media playback -- this manages the library, not the player
- Voice interface -- text messaging is the sweet spot
- Rich media previews (posters) -- SMS has limited support, text descriptions sufficient
- Per-user request quotas -- whitelisted users are trusted

## Context

Shipped v1.0 with 3,134 LOC TypeScript across 47 source files.

Tech stack: Node.js 22, TypeScript (strict ESM), Fastify 5, SQLite via better-sqlite3 + Drizzle ORM, OpenAI SDK v6, Twilio SDK v5, Zod 4, Biome 2.3, Docker multi-stage build.

Architecture: Twilio webhook -> user resolution -> onboarding or LLM conversation engine -> tool call loop -> Sonarr/Radarr API clients. Proactive notifications via Sonarr/Radarr webhook receivers with template-based SMS dispatch.

Key patterns: fire-and-forget webhook response (avoids Twilio 15s timeout), sliding window conversation history (last 20 messages with atomic tool call pairs), destructive action confirmation via pending actions table, graceful degradation when media servers unavailable.

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

---
*Last updated: 2026-02-14 after v1.0 milestone*

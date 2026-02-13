# Project Research Summary

**Project:** WadsMedia
**Domain:** Conversational media server management gateway (LLM-powered chatbot for Sonarr/Radarr via messaging)
**Researched:** 2026-02-13
**Confidence:** MEDIUM

## Executive Summary

WadsMedia is a conversational gateway that bridges natural language messaging (SMS/RCS via Twilio) to media server APIs (Sonarr/Radarr). The core innovation is using LLM function calling to interpret user intent and translate it into structured API calls, creating a zero-learning-curve interface for media management. Every competitor in this space (Requestrr, Searcharr, Overseerr) uses structured commands or web UIs. Natural language over SMS/RCS is an underserved channel with genuine distribution advantages—it works on every phone without installing apps or joining platforms.

The recommended architecture is a modular provider-based system: messaging providers abstract Twilio (and future channels), media clients wrap Sonarr/Radarr APIs, and an LLM service with tool calling orchestrates the translation layer. The critical path is search → LLM intent extraction → tool execution → response composition. SQLite with a sliding conversation history window provides context persistence without runaway token costs. Node.js 22, Fastify, Drizzle ORM, and the OpenAI SDK (configured for any compatible provider) form the core stack—all well-established, TypeScript-first tools with minimal dependency bloat.

The primary risks are LLM hallucinations executing destructive actions (mitigated by strict function calling mode and confirmation tiers), unbounded conversation history blowing up token costs (mitigated by sliding windows), and Twilio webhook reliability issues (mitigated by async processing with idempotency). Success depends on getting the LLM tool definitions and conversation context management right from day one—these are architectural foundations, not features you can retrofit.

## Key Findings

### Recommended Stack

The stack prioritizes simplicity, type safety, and modularity. Node.js 22 LTS provides the runtime with native fetch and stable long-term support. TypeScript with strict mode catches integration errors at compile time—essential when bridging three external APIs (Twilio, LLM, Sonarr/Radarr). Fastify over Express for its built-in schema validation, plugin architecture that maps cleanly to provider modules, and superior TypeScript ergonomics. SQLite with better-sqlite3 (not PostgreSQL) because this serves a handful of whitelisted users in a single container—zero separate database service, zero connection pooling complexity, trivial Docker persistence via volume mount.

**Core technologies:**
- **Fastify (HTTP framework):** Webhook receiver and health endpoints—chosen for schema validation and plugin modularity
- **OpenAI SDK:** LLM integration via function/tool calling—works with OpenAI, Anthropic, Ollama, any compatible provider via baseURL config
- **Twilio SDK:** RCS/SMS messaging provider—official SDK handles webhook signature validation and message sending
- **better-sqlite3 + Drizzle ORM:** Conversation persistence with type-safe queries—lightweight, no code generation, SQL-transparent
- **Zod:** Runtime validation for env vars, webhook payloads, API responses, and tool call arguments—single validation library across all boundaries
- **node-cron:** Proactive notification polling—lightweight, no external scheduler needed for single-container deployment
- **Node.js built-in fetch:** Sonarr/Radarr API client—no axios dependency, native to Node 22

**What to avoid:**
- LangChain (over-engineered for simple request-response tool calling)
- Prisma (code generation overhead, larger bundle than Drizzle)
- PostgreSQL (overkill for this scale, adds deployment complexity)
- WebSockets (no persistent connections needed for webhook-driven architecture)

### Expected Features

The competitive landscape shows every existing tool uses structured commands (Discord slash commands, Telegram /commands, or web UIs). Zero competitors use natural language. This is the entire differentiator. The second differentiator is conversational context—no competitor maintains state, so "add that one too" referring to a prior search result is impossible elsewhere.

**Must have (table stakes):**
- Search movies and TV shows by title—most basic interaction, every competitor has this
- Add to wanted list with sensible defaults—primary action, must work smoothly from day one
- Show library status ("you already have this")—prevents duplicate adds
- Download status checking ("where is my download?")
- Upcoming schedule ("what's coming this week?")
- Multi-user via phone whitelist—even personal servers have 2-5 users
- Conversation history persistence—enables conversational context ("add that one")
- Docker deployment—standard for arr ecosystem, users expect this

**Should have (competitive advantage):**
- Natural language understanding via LLM—the product's reason for existing
- Conversational context and memory—follow-up messages like "add that one too"
- Smart ambiguity resolution—LLM auto-picks when confident, asks naturally when uncertain
- Proactive notifications (LLM-composed)—"Season 3 of The Bear finished downloading" not robotic status dumps
- Remove/unmonitor from wanted list—competitors rarely support this
- SMS/RCS-first interface—works on every phone, no app install, zero platform lock-in
- Modular messaging provider architecture—add Telegram/Discord/Signal later without core rewrites

**Defer (v2+):**
- Additional messaging providers (Telegram, Discord, Signal)—architecture supports it, but validate SMS/RCS first
- Additional arr services (Lidarr, Readarr)—get TV/movies right before adding music/books
- Contextual suggestions/recommendations—"people who like X also watch Y"
- RCS rich cards and carousels—text-first experience must work, rich formatting is enhancement layer
- Season-level granularity for TV shows—"add only season 3"

**Anti-features (do not build):**
- Web dashboard / admin UI—contradicts messaging-first value prop, Overseerr already does this
- Approval workflow / request system—whitelist IS the approval, trusted users don't need gatekeeping
- Media playback control—different domain (Plex/Jellyfin APIs), massive scope expansion
- Per-user quotas and limits—over-engineering for personal/small-group use case
- Voice interface—different UX concerns, latency sensitivity, defer until messaging is validated

### Architecture Approach

The architecture is a modular three-layer system: (1) messaging provider adapters normalize inbound/outbound messages, (2) a thin message router orchestrates the request pipeline (authorize → load history → LLM → execute tools → respond), and (3) service layers (LLM, media clients, conversation store) are independently testable with no cross-layer leakage. The LLM service implements a tool call loop: send message + history + tool definitions to LLM, execute any returned tool calls, append results, call LLM again until it returns a final text response. Cap iterations at 5 to prevent runaway costs.

**Major components:**
1. **Messaging Provider Adapter (Twilio):** Receives webhooks, normalizes to internal InboundMessage format, sends responses via provider API—implements MessagingProvider interface so adding Telegram later just means adding a new adapter
2. **Message Router:** Central orchestrator—sequences auth, history load, LLM call, tool execution, response—contains zero business logic, only coordination
3. **LLM Service:** Builds system prompt, formats history, defines tool schemas, sends completion requests, parses tool calls, loops until final response—stateless, all context passed as arguments
4. **Tool Registry:** Centralized registry of tool definitions (JSON schemas for LLM) and execution handlers—adding Sonarr tools, Radarr tools, eventually Lidarr tools happens here without modifying LLM service
5. **Media Server Clients (Sonarr, Radarr):** Typed HTTP wrappers for REST APIs—separate clients (do NOT try to build a generic Servarr client, API differences leak constantly)
6. **Conversation Store:** SQLite persistence for per-user message history with role, content, tool call metadata—supports sliding window retrieval
7. **User Manager:** Phone number whitelist verification—simple authorization gate
8. **Notification Service:** Polls Sonarr/Radarr for completed downloads or receives webhooks, formats events into natural language, sends via messaging adapter—bypasses LLM, uses templates

**Key patterns:**
- **Provider Adapter Pattern:** MessagingProvider interface with parseWebhook() and sendMessage() methods—factory instantiates correct adapter at startup
- **LLM Tool Call Loop:** Send to LLM → get tool calls → execute → append results → loop until text response or max iterations
- **Thin Router / Fat Services:** Router is pure orchestration (<50 lines), all logic in services
- **Tool Registry:** Centralized tool schema + handler registration—extensibility mechanism

### Critical Pitfalls

Research identified six critical pitfalls that must be addressed architecturally in Phase 1, not bolted on later:

1. **LLM hallucinating API actions that don't exist**—LLM invents functions or fabricates arguments (e.g., made-up tvdbId values). Mitigation: strict function calling mode (`strict: true` in OpenAI tool definitions), server-side validation of ALL tool call arguments before execution, whitelist of allowed function names, confirmation tiers for destructive operations.

2. **Unbounded conversation history blowing up token costs**—Storing full history is required, but sending all of it to the LLM causes runaway costs and context window failures. Mitigation: sliding context window (last 20 messages or ~4000 tokens), token counting before each call, prioritize system prompt and tool definitions (never truncate those), implement history summarization for older context.

3. **Twilio webhook failures causing lost or duplicate messages**—Processing webhooks synchronously (LLM call inside handler) causes timeouts, retries, and duplicate responses. Mitigation: acknowledge webhook immediately (return 200 within 1-2 seconds), process async in background queue, use MessageSid as idempotency key, send responses via Twilio REST API not webhook response body.

4. **LLM executing destructive actions without confirmation**—"I don't want The Office anymore" interpreted as immediate deletion including files. Mitigation: categorize tools into read/write/destructive tiers, require confirmation for writes ("I'll add Breaking Bad with HD-1080p quality. OK?"), require explicit confirmation for destructive actions and never default to deleteFiles: true.

5. **Sonarr/Radarr API differences causing silent failures**—Sonarr uses tvdbId, Radarr uses tmdbId; series have seasons, movies are flat; quality profile IDs are instance-local not universal. Mitigation: separate clients for Sonarr and Radarr (do NOT build a generic Servarr wrapper), fetch and cache quality profiles/root folders on startup, map human-readable names to IDs, validate all required fields before POST.

6. **RCS fallback to SMS surprising users**—RCS-capable design (structured cards, long messages) falls back to plain SMS on unsupported devices—garbled output, message segmentation billing spikes. Mitigation: design text-first (all responses readable as plain SMS, rich formatting is enhancement), detect channel in webhook, format differently for RCS vs SMS, keep responses concise, break long messages at logical boundaries for SMS.

**Additional high-priority pitfalls:**
- Prompt injection ("ignore all previous instructions")—mitigate via server-side tool call validation regardless of LLM output, the LLM is an intent translator not an executor
- Twilio webhook signature validation—without this, anyone can impersonate users by sending fake webhooks
- No rate limiting on inbound messages per user—one user can run up LLM costs arbitrarily
- API keys exposed in logs—redact all Sonarr/Radarr URLs and auth headers from log output

## Implications for Roadmap

Based on research, the optimal phase structure follows the natural dependency chain while front-loading architectural foundations that cannot be retrofitted.

### Phase 1: Foundation and Core Infrastructure
**Rationale:** LLM integration, conversation context management, and messaging provider architecture are foundational decisions that ripple through the entire system. Getting these wrong requires rewrites, not refactors. Media server integration is simple HTTP wrapping and can start immediately in parallel.

**Delivers:**
- Express/Fastify server with config loading and validation
- SQLite database with migrations
- Core types and interfaces (InboundMessage, MessagingProvider, Tool, etc.)
- Twilio adapter with async webhook processing and idempotency
- Conversation store with sliding window history retrieval
- User manager with phone number whitelist

**Addresses:**
- Messaging provider adapter pattern (FEATURES.md differentiator: modular architecture)
- Twilio webhook reliability (PITFALLS.md critical #3)
- Multi-user support (FEATURES.md table stakes)

**Avoids:**
- Lost/duplicate messages from synchronous webhook processing
- Architecture lock-in to a single messaging provider

**Research flag:** Standard patterns—Fastify server setup, SQLite with Drizzle, Twilio webhooks are well-documented. No deeper research needed.

### Phase 2: Media Server API Clients
**Rationale:** Sonarr and Radarr clients are pure HTTP wrappers with no LLM dependency. They can be built and integration-tested against real instances independently. This phase validates connectivity and API understanding before introducing LLM complexity.

**Delivers:**
- SonarrClient: search series, add series, get calendar, get queue, remove series
- RadarrClient: search movies, add movie, get upcoming, get queue, remove movie
- Quality profile and root folder caching on startup
- Human-readable name to ID mapping (profiles, root folders)
- Integration tests against real or mock Sonarr/Radarr instances

**Uses:**
- Node.js built-in fetch (STACK.md recommendation)
- Zod for API response validation (STACK.md)

**Implements:**
- Media Server Client Layer (ARCHITECTURE.md component)

**Avoids:**
- Sonarr/Radarr API differences causing silent failures (PITFALLS.md critical #5)
- Hardcoded quality profile IDs (technical debt trap)

**Research flag:** Standard patterns—Sonarr/Radarr APIs are straightforward REST with stable v3 endpoints. Verify exact endpoint paths and required fields against live instances during implementation, but no pre-phase research needed.

### Phase 3: LLM Integration and Tool Call System
**Rationale:** This is the product's core value proposition. Tool definitions, the tool call loop, and conversation context windowing are interdependent—building one reveals requirements for the others. Strict function calling and confirmation tiers must be baked in from the start.

**Delivers:**
- LLM service with OpenAI SDK integration
- Tool registry with centralized schema + handler registration
- Sonarr tools: search_series, add_series, get_upcoming_series
- Radarr tools: search_movie, add_movie, get_upcoming_movies
- System prompt with scope definition and conciseness instructions
- Tool call loop with iteration cap (max 5)
- Confirmation tier system (read/write/destructive)
- Sliding context window with token counting

**Addresses:**
- Natural language understanding (FEATURES.md core differentiator)
- Conversational context and memory (FEATURES.md differentiator)
- Tool registry extensibility (ARCHITECTURE.md pattern)

**Avoids:**
- LLM hallucinating tool calls (PITFALLS.md critical #1)—strict mode, server-side validation
- Unbounded token costs (PITFALLS.md critical #2)—sliding window, token budgets
- Destructive actions without confirmation (PITFALLS.md critical #4)—tier system
- Prompt injection (PITFALLS.md security)—server-side validation regardless of LLM output

**Research flag:** NEEDS DEEPER RESEARCH. This phase requires careful prompt engineering, testing across different LLM providers (OpenAI, Anthropic, Ollama), and tuning the confirmation flow UX. Consider `/gsd:research-phase` for:
- System prompt design for media management domain
- Tool schema design best practices
- Confirmation tier UX patterns
- Token budget strategies for conversation apps

### Phase 4: Message Router and End-to-End Flow
**Rationale:** With messaging adapter, media clients, and LLM service complete, the router wires them together. This is when the full pipeline (webhook → auth → history → LLM → tools → respond) comes alive. Error handling and user-facing messages are refined here.

**Delivers:**
- Message router orchestration pipeline
- User authorization via whitelist
- Error handling with graceful user-facing messages
- End-to-end message flow testing
- Health check endpoint for Docker

**Implements:**
- Message Router (ARCHITECTURE.md component)
- Complete data flow (ARCHITECTURE.md inbound message flow)

**Addresses:**
- Search + add critical path (FEATURES.md table stakes)
- Download status, upcoming schedule (FEATURES.md table stakes)
- Smart ambiguity resolution (FEATURES.md differentiator)

**Avoids:**
- Router containing business logic (ARCHITECTURE.md anti-pattern #3)
- No graceful error handling (PITFALLS.md UX)

**Research flag:** Standard patterns—pipeline orchestration is well-understood. No additional research needed.

### Phase 5: Docker Packaging and Deployment
**Rationale:** With working end-to-end flow, package for deployment. Multi-stage Docker build keeps image small. Compose file with volume mounts for SQLite persistence and example env vars completes the deliverable.

**Delivers:**
- Multi-stage Dockerfile (build TS → slim production image)
- docker-compose.yml with service definitions
- Volume mount for /data (SQLite persistence)
- Environment variable documentation
- README with deployment instructions

**Uses:**
- node:22-slim base image (STACK.md)
- Docker Compose v2 (STACK.md)

**Addresses:**
- Docker deployment expectation (FEATURES.md table stakes)
- Environment variable configuration (FEATURES.md table stakes)

**Avoids:**
- Docker networking failures (PITFALLS.md)—use service names, not localhost

**Research flag:** Standard patterns—Docker for Node.js apps is well-documented. No additional research needed.

### Phase 6: Proactive Notifications
**Rationale:** Deferred until core conversational flow is validated. Notifications are expected (table stakes) but not essential for MVP validation. They are a separate concern—polling/webhook receiver, event detection, template formatting, outbound messaging—that can be added without modifying existing code.

**Delivers:**
- Notification service with polling loop (node-cron)
- Event detection (compare queue state, detect completed downloads)
- Event formatters (templates, not LLM—cost optimization)
- User notification preferences (optional: which events to notify)

**Uses:**
- node-cron (STACK.md)
- Messaging provider sendMessage() (reuses existing adapter)

**Implements:**
- Notification Service (ARCHITECTURE.md component)
- Proactive notification flow (ARCHITECTURE.md data flow)

**Addresses:**
- Proactive notifications (FEATURES.md table stakes)

**Avoids:**
- Using LLM for notifications (ARCHITECTURE.md anti-pattern #4)—templates are sufficient
- Notification spam (PITFALLS.md UX)—batch events over 5-minute windows

**Research flag:** Standard patterns—polling loops and webhook receivers are well-understood. No additional research needed.

### Phase 7: Additional Tools and Refinements
**Rationale:** Once MVP is deployed and validated with real users, expand tool coverage based on actual usage patterns. This phase adds remove/unmonitor, season-level granularity, richer status messages.

**Delivers:**
- Remove/unmonitor tools (remove_series, remove_movie)
- Season-level add for TV shows
- Enhanced status messages (progress, ETA)
- Usage analytics (optional: what do users ask for most?)

**Addresses:**
- Natural language remove (FEATURES.md differentiator)
- Season-level granularity (FEATURES.md v1.x)

**Research flag:** Standard patterns—these are additional tool definitions following the same registry pattern. No research needed.

### Phase Ordering Rationale

- **Foundation first (Phase 1):** Messaging adapter architecture, async webhook processing, and conversation storage are foundational—retrofitting these later requires rewrites. SQLite setup and user whitelist are simple but unlock multi-user testing.
- **Media clients early (Phase 2):** Independent of LLM complexity, can be integration-tested immediately, validates Sonarr/Radarr connectivity before introducing tool calling.
- **LLM integration as separate phase (Phase 3):** The most complex and novel component. Isolating it allows focused testing, prompt tuning, and provider validation without coupling to other concerns.
- **Router integration (Phase 4):** Only makes sense once all services exist. This is when the product "works" end-to-end.
- **Docker packaging (Phase 5):** Natural deployment milestone after working E2E flow.
- **Notifications deferred (Phase 6):** Separable concern that does not block core conversational value prop validation.
- **Refinements last (Phase 7):** Informed by real usage, not speculation.

**Dependency highlights:**
- Phase 4 depends on Phases 1-3 completing (router needs all services)
- Phase 6 depends on Phase 1 (messaging adapter) and Phase 2 (media clients) but is independent of Phases 3-4
- Phases 2 and 3 can proceed in parallel after Phase 1

### Research Flags

**Phases needing deeper research during planning:**
- **Phase 3 (LLM Integration):** Complex domain-specific prompt engineering, tool schema design, confirmation UX patterns, token budget strategies. Consider `/gsd:research-phase` for system prompt design and tool calling best practices.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Foundation):** Fastify server, SQLite with Drizzle, Twilio webhooks—all well-documented
- **Phase 2 (Media Clients):** REST API wrappers—straightforward HTTP client code
- **Phase 4 (Router):** Pipeline orchestration—established architectural pattern
- **Phase 5 (Docker):** Node.js Docker packaging—standard practice
- **Phase 6 (Notifications):** Polling loops and webhook receivers—well-understood
- **Phase 7 (Refinements):** Follows Phase 3 tool registry pattern

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Technology choices (Fastify, Drizzle, OpenAI SDK, Twilio SDK, node-cron) are HIGH confidence—well-established, stable APIs. Version numbers are MEDIUM—all from training data cutoff May 2025, need live validation via `npm view` before install. |
| Features | MEDIUM | Competitor analysis (Requestrr, Searcharr, Overseerr) based on training data—feature sets may have changed. Core insight (no competitor uses NLP/LLM) is HIGH confidence—this is a fundamental architectural difference that does not change incrementally. Table stakes vs differentiators mapping is solid. |
| Architecture | MEDIUM | Architectural patterns (provider adapter, tool registry, tool call loop, thin router) are HIGH confidence—industry-standard, language-agnostic patterns. Integration specifics (Twilio webhook behavior, OpenAI tool calling API) are MEDIUM—based on training data, should be verified against current docs during Phase 1/3 implementation. |
| Pitfalls | MEDIUM | Critical pitfalls (hallucinations, unbounded history, webhook reliability, confirmation tiers, API differences, RCS fallback) are based on well-established LLM application and webhook integration challenges. These are not product-specific but category-specific. The exact mitigation strategies (strict mode, sliding windows, async processing, tier systems) are proven patterns. |

**Overall confidence:** MEDIUM

Research is sufficient for roadmap planning and phase structuring. The architectural recommendations are sound and based on established patterns. The primary uncertainty is exact version numbers and minor API details, which are validation tasks during implementation, not blockers for planning.

### Gaps to Address

Version numbers and API details need live validation:

- **Stack versions:** All package versions from training data (cutoff May 2025). Before Phase 1 implementation, run `npm view fastify openai twilio better-sqlite3 drizzle-orm typescript zod pino node-cron vitest biome version` to get current versions. The library choices themselves are HIGH confidence—only the pins are uncertain.

- **Sonarr/Radarr API v3 vs v4:** Training data reflects API v3. Sonarr v4 and Radarr v5+ may have introduced API v4. Validate during Phase 2 by checking `/api/v3/system/status` and `/api/v4/system/status` against live instances to determine which version to target.

- **Twilio RCS availability and fallback behavior:** RCS support and fallback logic should be verified against current Twilio RCS documentation during Phase 1. The general pattern (design text-first, detect channel, format accordingly) is sound regardless of specifics.

- **OpenAI strict mode availability across providers:** Strict function calling mode (`strict: true`) is an OpenAI feature as of 2024. Verify support in Anthropic, Ollama, LM Studio, and other OpenAI-compatible providers during Phase 3. Fallback: implement server-side schema validation strictly if provider does not support strict mode.

- **Sonarr/Radarr scoped API keys:** Training data shows no scoped key support. Verify whether Sonarr v4/Radarr v5 added this. If not, mitigation is application-level endpoint restriction (do NOT expose system/config endpoints as tools).

Roadmap implications:
- Allocate time in Phase 1 kickoff for version validation and env setup
- Allocate time in Phase 2 for API version detection and endpoint verification
- Allocate time in Phase 3 for LLM provider compatibility testing (OpenAI, Anthropic, Ollama minimum)
- Flag Phase 3 for potential `/gsd:research-phase` if prompt engineering or tool schema design proves more complex than anticipated

## Sources

### Primary (HIGH confidence)
- WadsMedia PROJECT.md—project scope, requirements, constraints (read directly from repository)
- Architectural patterns (provider adapter, tool registry, tool call loop)—language-agnostic, industry-standard patterns used across production systems
- Docker deployment patterns for Node.js—well-established, stable practices

### Secondary (MEDIUM confidence)
- npm package ecosystem (Fastify, Drizzle, OpenAI SDK, Twilio SDK, Zod, Pino, node-cron, Vitest, Biome)—library choices from training data through May 2025; APIs are stable, exact versions need validation
- Sonarr/Radarr API v3 documentation from Servarr wiki—training data knowledge; endpoint structure is stable but exact required fields and v4 migration should be verified
- Twilio Messaging API and RCS documentation—training data knowledge; webhook behavior and signature validation are stable, RCS-specific features should be verified
- OpenAI function/tool calling specification—training data knowledge; well-documented stable API, but strict mode support across compatible providers needs verification
- Competitor analysis (Requestrr, Searcharr, Overseerr, Jellyseerr)—training data knowledge through early 2025; feature sets may have changed but core insight (no NLP/LLM usage) is architecturally fundamental

### Tertiary (LOW confidence)
- Exact version numbers for all npm packages—all from training data, need live validation via `npm view` before installation
- Sonarr v4 / Radarr v5 API changes—may have introduced API v4; verify during implementation
- Scoped API key support in Sonarr/Radarr—not present in training data; verify if added in recent versions

**Note:** WebSearch, WebFetch, and Bash tools were unavailable during this research session. All findings are based on training data knowledge (cutoff: May 2025). For a production deployment, verify version numbers, API endpoints, and provider-specific features against current official documentation during implementation phases.

---
*Research completed: 2026-02-13*
*Ready for roadmap: yes*

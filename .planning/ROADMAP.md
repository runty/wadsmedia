# Roadmap: WadsMedia

## Overview

WadsMedia delivers a conversational gateway from natural language messaging to Sonarr/Radarr media servers. The roadmap progresses from infrastructure foundation through messaging, user management, and media server integration, then layers in the LLM conversation engine and tool-based capabilities (search, library management, status monitoring). Each phase delivers a coherent, independently verifiable capability that builds toward the complete end-to-end experience: text a message, get media managed.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Project scaffolding, Docker container, database, config, logging, and health check
- [x] **Phase 2: Messaging Gateway** - Twilio adapter with webhook receiving, signature validation, and outbound messaging
- [x] **Phase 3: User Management** - Phone whitelist authorization, admin designation, unknown user onboarding, and conversation isolation
- [x] **Phase 4: Media Server Clients** - Typed Sonarr and Radarr API wrappers with caching and graceful error handling
- [ ] **Phase 5: Conversation Engine** - LLM integration with tool calling framework, conversation history, and confirmation system
- [ ] **Phase 6: Search and Discovery** - Message router and LLM tools for searching movies/shows, ambiguity resolution, and schedule viewing
- [ ] **Phase 7: Library Management** - LLM tools for adding, removing, and managing media with conversational context
- [ ] **Phase 8: Status and Notifications** - Download status checking and proactive event notifications

## Phase Details

### Phase 1: Foundation
**Goal**: A running application container with configuration, database, logging, and health monitoring ready for all subsequent layers
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05
**Success Criteria** (what must be TRUE):
  1. Application starts in a Docker container using docker-compose and persists data across restarts via volume mount
  2. All settings (API keys, server URLs, phone whitelist) are configured via environment variables with validation on startup
  3. SQLite database is created automatically on first run with schema migrations applied
  4. Application logs are structured JSON output via Pino, visible in docker logs
  5. Health check endpoint responds with 200 OK and basic status information
**Plans:** 3 plans

Plans:
- [x] 01-01-PLAN.md -- Project scaffolding, tooling, config module, and Fastify server factory
- [x] 01-02-PLAN.md -- SQLite database with Drizzle ORM, schema, migrations, and Fastify plugin
- [x] 01-03-PLAN.md -- Health check endpoint, Docker multi-stage build, and docker-compose

### Phase 2: Messaging Gateway
**Goal**: The application can receive text messages from Twilio via webhook and send responses back, with proper security and text-first formatting
**Depends on**: Phase 1
**Requirements**: MSG-01, MSG-02, MSG-03, MSG-04
**Success Criteria** (what must be TRUE):
  1. Incoming Twilio RCS/SMS messages are received via webhook endpoint with signature validation rejecting forged requests
  2. Application can send outbound text messages via Twilio API
  3. Messaging provider is behind a modular interface that could be swapped for another provider without changing core logic
  4. Responses are readable as plain SMS text with RCS enhancement when available (no RCS-only formatting)
**Plans:** 2 plans

Plans:
- [x] 02-01-PLAN.md -- Messaging provider interface and Twilio adapter class
- [x] 02-02-PLAN.md -- Webhook endpoint, signature validation, and Fastify plugin wiring

### Phase 3: User Management
**Goal**: The system knows who is texting, authorizes known users, onboards unknown users through conversation, and keeps each user's data isolated
**Depends on**: Phase 2
**Requirements**: USER-01, USER-02, USER-03, USER-04, USER-05
**Success Criteria** (what must be TRUE):
  1. Admin user is designated via environment variable and can receive approval requests
  2. Known users on the phone number whitelist are identified and authorized when they text the app
  3. Unknown phone numbers trigger a name prompt, then the admin receives a text asking to approve the new user
  4. Each user has a stored display name associated with their phone number
  5. Users only see their own conversation history -- no cross-user data leakage
**Plans:** 2 plans

Plans:
- [x] 03-01-PLAN.md -- Users table schema, user service module, and user-resolver Fastify plugin with startup seeding
- [x] 03-02-PLAN.md -- Onboarding state machine and webhook handler wiring for user routing

### Phase 4: Media Server Clients
**Goal**: The application can communicate with Sonarr and Radarr APIs to search, add, remove, and query media with validated, typed responses
**Depends on**: Phase 1
**Requirements**: API-01, API-02, API-03, API-04
**Success Criteria** (what must be TRUE):
  1. Sonarr API client can search series, add series, remove series, get calendar, and get download queue with Zod-validated responses
  2. Radarr API client can search movies, add movies, remove movies, get upcoming, and get download queue with Zod-validated responses
  3. Quality profiles and root folders are fetched from both servers on startup and cached for use in add operations
  4. When Sonarr or Radarr is unreachable, operations fail gracefully with user-friendly error messages instead of crashes
**Plans:** 3 plans

Plans:
- [x] 04-01-PLAN.md -- Shared HTTP utility, error classes, and Sonarr API client with Zod-validated responses
- [x] 04-02-PLAN.md -- Radarr API client with Zod-validated responses
- [x] 04-03-PLAN.md -- Fastify plugins for startup caching, graceful degradation, and server wiring

### Phase 5: Conversation Engine
**Goal**: Natural language messages are interpreted by a configurable LLM that can call tools, maintain conversation context, and require confirmation before destructive actions
**Depends on**: Phase 1
**Requirements**: CONV-01, CONV-02, CONV-03, CONV-04
**Success Criteria** (what must be TRUE):
  1. Natural language messages are sent to a configurable OpenAI-compatible LLM endpoint and interpreted as intent
  2. Full conversation history is persisted per user, with a sliding context window sent to the LLM to manage token costs
  3. LLM uses structured tool/function calling to request Sonarr/Radarr actions, with a tool call loop that executes and re-prompts until a final text response
  4. Destructive actions (remove, delete) require explicit user confirmation before execution
**Plans:** 3 plans

Plans:
- [ ] 05-01-PLAN.md -- Database schema, LLM client, conversation history with sliding window, and system prompt
- [ ] 05-02-PLAN.md -- Tool registry with Zod-to-JSON-Schema and tool call loop with confirmation interception
- [ ] 05-03-PLAN.md -- Confirmation tier, conversation engine orchestrator, Fastify plugin, and webhook integration

### Phase 6: Search and Discovery
**Goal**: Users can text the app to search for movies and shows, see if media is already in their library, handle ambiguous results, and check upcoming schedules -- the first complete end-to-end conversational flow
**Depends on**: Phase 2, Phase 3, Phase 4, Phase 5
**Requirements**: SRCH-01, SRCH-02, SRCH-03, SRCH-04, SRCH-05
**Success Criteria** (what must be TRUE):
  1. User texts a movie title and receives search results with relevant details (year, overview)
  2. User texts a TV show title and receives search results with relevant details (year, network, seasons)
  3. Search results indicate whether media is already in the user's library
  4. When search returns a single strong match, the app auto-selects it; when results are ambiguous, the app presents options and asks the user to choose
  5. User can ask about upcoming air dates and receives a schedule of upcoming episodes and movie releases
**Plans**: TBD

Plans:
- [ ] 06-01: Message router and end-to-end pipeline
- [ ] 06-02: Search tools (movie and TV show)
- [ ] 06-03: Ambiguity resolution and schedule tools

### Phase 7: Library Management
**Goal**: Users can add and remove media from their libraries through natural conversation, including referencing previous search results
**Depends on**: Phase 6
**Requirements**: LIB-01, LIB-02, LIB-03, LIB-04
**Success Criteria** (what must be TRUE):
  1. User can text to add a movie to the wanted list with sensible quality and path defaults applied automatically
  2. User can text to add a TV show to the wanted list with sensible quality and path defaults applied automatically
  3. User can text to remove or unmonitor media and the app executes after confirmation
  4. User can reference previous conversation context naturally ("add that one too", "actually the second one") and the app resolves the reference correctly
**Plans**: TBD

Plans:
- [ ] 07-01: Add movie and add show tools
- [ ] 07-02: Remove/unmonitor tools with confirmation
- [ ] 07-03: Conversational context reference resolution

### Phase 8: Status and Notifications
**Goal**: Users can check on their downloads and receive proactive notifications when media events occur, completing the full media management experience
**Depends on**: Phase 6
**Requirements**: STAT-01, STAT-02, STAT-03
**Success Criteria** (what must be TRUE):
  1. User can text to check download progress and queue status, receiving current state of active downloads
  2. User can text to view their upcoming episode and movie schedule
  3. App proactively sends notifications when downloads complete or new episodes become available, without the user asking
**Plans**: TBD

Plans:
- [ ] 08-01: Download status and queue tools
- [ ] 08-02: Schedule viewing tool
- [ ] 08-03: Proactive notification service

## Progress

**Execution Order:**
Phases execute in numeric order. Note: Phases 4 and 5 can proceed in parallel after Phase 1. Phase 6 requires Phases 2-5 complete. Phases 7 and 8 can proceed in parallel after Phase 6.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-02-14 |
| 2. Messaging Gateway | 2/2 | Complete | 2026-02-14 |
| 3. User Management | 2/2 | Complete | 2026-02-14 |
| 4. Media Server Clients | 3/3 | Complete | 2026-02-14 |
| 5. Conversation Engine | 0/3 | Not started | - |
| 6. Search and Discovery | 0/3 | Not started | - |
| 7. Library Management | 0/3 | Not started | - |
| 8. Status and Notifications | 0/3 | Not started | - |

# Feature Research

**Domain:** Conversational media server management (Sonarr/Radarr chatbot via messaging)
**Researched:** 2026-02-13
**Confidence:** MEDIUM (based on training data knowledge of competitors; WebSearch/WebFetch unavailable for live verification)

## Competitor Landscape Summary

Before categorizing features, here is what existing tools in this space offer. This provides the evidence base for the table stakes / differentiator / anti-feature categorization below.

### Requestrr (Discord bot)
- Search movies and TV shows via Discord slash commands and buttons
- Add media to Sonarr/Radarr with quality profile and root folder selection
- Interactive button-based selection when multiple results match
- Notification channel for completed downloads
- Per-user request quotas and limits
- Admin-only commands for configuration
- Supports Overseerr/Ombi as request backends (not just direct Sonarr/Radarr)
- No natural language -- uses structured commands and button workflows

### Searcharr (Telegram bot)
- Search Sonarr and Radarr via Telegram commands (/movie, /series)
- Add media directly to Sonarr/Radarr from search results
- Inline keyboard buttons for selecting from multiple results
- Shows existing library status (already monitored, already downloaded)
- Admin-only add permissions (configurable)
- Quality profile selection
- Readarr support (books) in addition to Sonarr/Radarr
- No natural language -- strictly command-based (/movie title, /series title)

### Overseerr / Jellyseerr (web UI, not chatbot)
- Full web dashboard for media requests
- Search with rich metadata (posters, descriptions, ratings, cast)
- Request workflow with approval system (user requests, admin approves)
- Status tracking (requested, approved, available, partially available for seasons)
- User management with Plex/Jellyfin authentication
- Notification integrations (Discord, Slack, Telegram, email, webhooks)
- Discover/trending media suggestions
- Per-user request limits
- Issue reporting on existing media (quality problems, missing subtitles)
- Season-level granularity for TV shows (request specific seasons)
- Automatic availability detection (checks if already in library)

### Telegram Sonarr/Radarr Bots (various community bots)
- Basic command-driven interaction (/add, /search, /status, /upcoming)
- Download progress/status checking
- Calendar/upcoming episode notifications
- System health checks (disk space, indexer status)
- Library statistics
- Some support webhook-driven notifications from Sonarr/Radarr

### Key Patterns Across All Competitors
1. **All use structured commands** -- none use natural language / LLM interpretation
2. **Search + add is universal** -- every tool does this
3. **Disambiguation via buttons/selection** -- when multiple results match, users pick from a list
4. **Notifications are common** -- most support some form of "download complete" alerts
5. **Quality profile selection** -- most let users pick quality profiles during add
6. **No conversation context** -- every interaction is stateless (no "add that one too")
7. **No proactive intelligence** -- bots respond to commands, they don't suggest things

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete. These are features that EVERY competitor in the space provides.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Search movies by title | Core function of every competitor. Cannot manage media without finding it first. | LOW | Radarr API `/movie/lookup?term=` -- straightforward |
| Search TV shows by title | Core function of every competitor. Same reasoning as movie search. | LOW | Sonarr API `/series/lookup?term=` -- straightforward |
| Add movie to wanted list | Requestrr, Searcharr, Overseerr all do this. Primary action users want. | MEDIUM | Requires quality profile + root folder selection. Need sensible defaults. |
| Add TV show to wanted list | Same as movies. Users expect symmetry between movie and show management. | MEDIUM | More complex than movies: must handle season/episode granularity |
| Disambiguation when multiple results match | Every competitor handles this via buttons/selection. Users cannot always name content precisely. | MEDIUM | LLM advantage: can auto-pick confidently or ask naturally, not just dump a numbered list |
| Show what is already in library | Overseerr and Searcharr both show "already monitored" status. Prevents duplicate adds. | LOW | Query Sonarr/Radarr library before suggesting add |
| Download status checking | Multiple bots support this. Users want to know "where is my download?" | MEDIUM | Sonarr/Radarr queue API. Need to present progress clearly in text. |
| Upcoming schedule | Calendar of upcoming episodes/movies is standard. Users want "what's coming this week?" | LOW | Sonarr calendar API + Radarr upcoming API |
| Multi-user support | Requestrr and Overseerr both support multiple users. A single-user tool is too limited. | MEDIUM | Phone number whitelist per PROJECT.md. Need per-user conversation isolation. |
| Proactive download completion notifications | Requestrr has notification channels, Overseerr sends notifications. Users expect to know when media is ready. | MEDIUM | Requires webhook receiver or polling. Sonarr/Radarr support webhook on grab/download. |
| Docker deployment | Standard for this entire ecosystem. Sonarr, Radarr, Overseerr, Requestrr all deploy via Docker. | LOW | Dockerfile + docker-compose.yml. Users expect this. |
| Environment variable configuration | Standard Docker pattern. Every tool in the arr ecosystem uses env vars or config files. | LOW | API keys, server URLs, whitelist, LLM config |

### Differentiators (Competitive Advantage)

Features that NO existing competitor offers. These are where WadsMedia creates unique value.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Natural language understanding via LLM | **The core differentiator.** No competitor uses NLP/LLM. All use structured commands. Users say "get me that new sci-fi movie with Tom Hanks" instead of `/movie finch`. Dramatically lower learning curve. | HIGH | Requires prompt engineering, intent extraction, entity recognition. This is the product. |
| Conversational context / memory | No competitor maintains conversation state. Users can say "add that one too" or "actually, the second one" after a search. This is what makes it feel like a conversation, not a command-line. | HIGH | Full conversation history per PROJECT.md. LLM needs prior messages in context window. |
| Smart ambiguity resolution | Competitors show numbered lists and wait for selection. An LLM can auto-resolve "The Office" to the US version based on context, or ask a natural clarifying question ("Did you mean the UK or US version?"). | MEDIUM | Confidence thresholds: high confidence = auto-act, low confidence = ask user naturally |
| SMS/RCS-first interface (via Twilio) | Competitors are locked to Discord or Telegram. SMS/RCS works on every phone with zero app installation. Users do not need to join a Discord server or install Telegram. | MEDIUM | Twilio RCS API integration. RCS provides rich messaging (carousels, suggested replies) on supported devices, falls back to SMS. |
| Proactive intelligent notifications | Beyond "download complete" -- LLM can compose natural messages like "Season 3 of The Bear just finished downloading. All 10 episodes are ready." instead of robotic status dumps. | MEDIUM | Webhook receiver + LLM-composed notification messages |
| Modular messaging provider architecture | No competitor abstracts the messaging layer. WadsMedia can add Signal, Telegram, Discord, WhatsApp in the future without rewriting core logic. | MEDIUM | Provider interface abstraction. Pay cost once, benefit repeatedly. |
| Configurable LLM provider | Use OpenAI, Anthropic, local models, or any OpenAI-compatible endpoint. No competitor offers this because none use LLMs. Lets users control cost and privacy. | MEDIUM | OpenAI-compatible API abstraction per PROJECT.md |
| Natural language remove/unmonitor | Competitors rarely support removing media (Overseerr has no delete). "Stop tracking The Flash" is natural and useful for library maintenance. | LOW | Sonarr/Radarr delete/unmonitor API endpoints |
| Contextual suggestions | After adding a show, LLM could suggest "People who like Breaking Bad also watch Better Call Saul -- want me to add it?" using Sonarr/Radarr recommendation data or TMDB. | HIGH | Requires external API (TMDB) or Sonarr/Radarr recommendation endpoints. Nice-to-have, not MVP. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. Deliberately do NOT build these.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Web dashboard / admin UI | "I need a visual interface for configuration" | Contradicts core value proposition (messaging-first, no UI to learn). Splits development focus. Overseerr already does this better. If users want a web UI, they should use Overseerr. | All config via environment variables. Use Sonarr/Radarr native UIs for advanced management. |
| Approval workflow / request system | Overseerr has it. "I want to approve requests before they download." | Adds enormous complexity for a tool aimed at small/personal media servers. WadsMedia users manage their own servers, not shared Plex instances with 50 users. Whitelist IS the approval. | Phone number whitelist controls who can interact. If a number is whitelisted, they are trusted. Consider optional "confirm before add" flag per user if needed. |
| Media playback control | "Can I tell it to play a movie on my TV?" | Completely different domain (Plex/Jellyfin/Kodi APIs). Massive scope expansion. Unreliable cross-platform. Different per playback device. | Explicitly out of scope per PROJECT.md. Say "it's ready on Plex" not "playing it now." |
| Lidarr / Readarr / Bazarr integration in v1 | "I also want to manage my music/books/subtitles" | Scope creep. Each arr adds API surface, testing surface, and LLM prompt complexity. Get Sonarr + Radarr right first. | Architecture should use a provider pattern so adding arr services later is straightforward. Explicitly defer to v2+. |
| Voice interface | "I want to talk to it, not type" | Requires speech-to-text, dramatically different UX concerns, latency sensitivity. Messaging is the sweet spot. | Text-based messaging. Voice can be a future messaging provider if demand materializes. |
| Self-serve user registration | "Let people sign themselves up" | Security risk on a system that controls downloads. Admin must trust users. Complexity of registration flows, abuse prevention. | Admin adds phone numbers to whitelist. Simple, secure, fits the personal/small-group use case. |
| Per-user quotas and request limits | Requestrr has this. "Limit how many requests per day." | Over-engineering for the target use case (personal server, small friend group). Adds state management complexity. | If a user is whitelisted, they are trusted. If abuse is a problem, remove them from whitelist. |
| Rich media previews (posters, trailers) | Overseerr shows beautiful posters and metadata. "Show me the movie poster." | SMS/RCS has limited rich media support. MMS costs money. Adds complexity to messaging abstraction. Text descriptions are sufficient for a conversational interface. | Include TMDB/TVDB links in responses so users can look up posters in browser if they want. Consider RCS cards where supported, but do not depend on them. |
| Direct torrent/usenet management | "Let me see and manage individual torrents" | Sonarr/Radarr abstract this intentionally. Exposing download client internals breaks the abstraction and creates a fragile, confusing interface. | Show download progress from Sonarr/Radarr queue API. Let the arr apps manage their download clients. |

## Feature Dependencies

```
[Messaging Provider (Twilio RCS)]
    └──requires──> [Webhook Endpoint (incoming messages)]
                       └──requires──> [Docker HTTP Server]

[Natural Language Understanding]
    └──requires──> [LLM Provider Integration]
    └──requires──> [Intent Extraction + Entity Recognition]
                       └──requires──> [Sonarr/Radarr API Client]

[Search Movies/Shows]
    └──requires──> [Sonarr/Radarr API Client]
    └──requires──> [Natural Language Understanding]

[Add to Wanted List]
    └──requires──> [Search Movies/Shows] (must find before adding)
    └──requires──> [Quality Profile + Root Folder defaults]

[Remove from Wanted List]
    └──requires──> [Sonarr/Radarr API Client]
    └──requires──> [Natural Language Understanding]

[Download Status]
    └──requires──> [Sonarr/Radarr API Client]

[Upcoming Schedule]
    └──requires──> [Sonarr/Radarr API Client]

[Conversation History]
    └──requires──> [Persistent Storage (SQLite/similar)]
    └──enhances──> [Natural Language Understanding] (context for follow-ups)

[Disambiguation / Smart Selection]
    └──requires──> [Search Movies/Shows]
    └──enhances──> [Natural Language Understanding]

[Proactive Notifications]
    └──requires──> [Webhook Receiver (from Sonarr/Radarr)]
    └──requires──> [Messaging Provider (outbound)]
    └──requires──> [LLM Provider] (for composing natural messages)

[Multi-User Support]
    └──requires──> [Phone Number Whitelist]
    └──requires──> [Per-User Conversation Isolation]

[Modular Messaging Provider]
    └──enhances──> [Messaging Provider (Twilio RCS)]
    └──enables──> [Future: Telegram, Discord, Signal providers]
```

### Dependency Notes

- **Add to Wanted List requires Search**: Users must find content before they can add it. The search-then-add flow is fundamental.
- **Conversation History enhances NLU**: Without history, every message is isolated. With history, "add that one" and "no, the other one" work.
- **Proactive Notifications require bidirectional messaging**: The app must be able to send unsolicited messages, not just respond. This means outbound messaging capability independent of user-initiated conversations.
- **Natural Language Understanding requires LLM Provider**: This is the critical path. Without the LLM, there is no product differentiation.
- **Multi-User requires Conversation Isolation**: Messages from different phone numbers must not leak context between users.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what is needed to validate the core concept of "manage media via text message."

- [ ] **Twilio RCS/SMS webhook receiver** -- accept incoming messages
- [ ] **LLM intent extraction** -- parse natural language into structured intents (search, add, remove, status, upcoming)
- [ ] **Sonarr API client** -- search, add, remove, calendar, queue
- [ ] **Radarr API client** -- search, add, remove, upcoming, queue
- [ ] **Search movies and TV shows** -- the most basic interaction
- [ ] **Add to wanted list with sensible defaults** -- quality profile and root folder from config, not asked every time
- [ ] **Show library status** -- "you already have this" prevents duplicate adds
- [ ] **Download status** -- "where is my download?"
- [ ] **Upcoming schedule** -- "what's coming this week?"
- [ ] **Basic disambiguation** -- when multiple results match, present options naturally
- [ ] **Conversation history** -- persistent per-user message log fed to LLM for context
- [ ] **Multi-user via phone whitelist** -- env var list of authorized numbers
- [ ] **Docker container** -- single container deployment
- [ ] **Environment variable configuration** -- all settings via env vars

### Add After Validation (v1.x)

Features to add once core is working and the conversational UX is validated.

- [ ] **Proactive notifications** -- webhook receiver for Sonarr/Radarr events, LLM-composed outbound messages
- [ ] **Remove/unmonitor from wanted list** -- "stop tracking The Flash"
- [ ] **Smart ambiguity resolution** -- LLM auto-picks when confident, asks when uncertain (requires tuning from real usage data)
- [ ] **Season-level granularity** -- "add only season 3 of The Office"
- [ ] **Richer status messages** -- "3 of 10 episodes downloaded, estimated 2 hours remaining"

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Additional messaging providers** -- Telegram, Discord, Signal, WhatsApp (modular architecture makes this possible)
- [ ] **Contextual suggestions/recommendations** -- "People who like X also watch Y"
- [ ] **Additional arr service support** -- Lidarr, Readarr, Prowlarr
- [ ] **RCS rich cards/carousels** -- leverage RCS-specific features for supported devices
- [ ] **Usage analytics** -- what do users ask for most? what fails? (for improving prompts)
- [ ] **Multiple Sonarr/Radarr instance support** -- for users with 4K + 1080p instances

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Search movies/shows | HIGH | LOW | P1 |
| Add to wanted list | HIGH | MEDIUM | P1 |
| LLM intent extraction | HIGH | HIGH | P1 |
| Conversation history | HIGH | MEDIUM | P1 |
| Download status | HIGH | LOW | P1 |
| Upcoming schedule | MEDIUM | LOW | P1 |
| Multi-user (whitelist) | MEDIUM | LOW | P1 |
| Basic disambiguation | HIGH | MEDIUM | P1 |
| Library status check | MEDIUM | LOW | P1 |
| Docker deployment | HIGH | LOW | P1 |
| Proactive notifications | HIGH | MEDIUM | P2 |
| Remove/unmonitor | MEDIUM | LOW | P2 |
| Smart ambiguity resolution | MEDIUM | MEDIUM | P2 |
| Season-level granularity | MEDIUM | MEDIUM | P2 |
| Modular messaging providers | MEDIUM | MEDIUM | P2 |
| Additional arr services | LOW | MEDIUM | P3 |
| Contextual suggestions | LOW | HIGH | P3 |
| RCS rich cards | LOW | MEDIUM | P3 |
| Usage analytics | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch -- validates the core concept
- P2: Should have, add when core is stable
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Requestrr (Discord) | Searcharr (Telegram) | Overseerr (Web) | WadsMedia (SMS/RCS) |
|---------|---------------------|---------------------|-----------------|---------------------|
| Search media | Slash commands + buttons | /movie, /series commands | Web search bar with metadata | Natural language ("find me sci-fi movies like Interstellar") |
| Add media | Button click after search | Inline keyboard button | Request button with approval | Natural language ("add it" / "yeah, grab that") |
| Remove media | Not supported | Not supported | Not supported | Natural language ("stop tracking The Flash") |
| Disambiguation | Button selection from list | Inline keyboard from list | Click correct result | LLM auto-resolves or asks naturally |
| Conversation context | None (stateless) | None (stateless) | None (stateless) | Full history ("add that one too") |
| Download status | Notification channel | Basic command | Status in web UI | Natural language ("how's my download?") |
| Upcoming schedule | Not built-in | Not built-in | Not built-in | Natural language ("what's coming this week?") |
| Notifications | Discord channel | Not built-in | Multi-channel (Discord, Slack, email) | Proactive SMS/RCS messages |
| User management | Discord roles | Telegram user IDs | Plex/Jellyfin auth + approval | Phone number whitelist |
| Request limits | Per-user quotas | Admin-only adds | Per-user limits | Whitelist = trusted (no limits) |
| Platform | Discord only | Telegram only | Web browser | Any phone (SMS/RCS), future multi-platform |
| Setup complexity | Docker + Discord bot token | Docker + Telegram bot token | Docker + Plex/Jellyfin | Docker + Twilio + LLM API key |
| Learning curve | Must learn slash commands | Must learn /commands | Low (web UI) | Zero (just text naturally) |
| Natural language | No | No | No | **Yes -- core differentiator** |
| Rich media | Discord embeds (images) | Telegram inline images | Full web (posters, trailers) | Text-first, RCS cards where supported |

## Key Insights for Roadmap

1. **The LLM is the product.** Every competitor uses structured commands. Natural language understanding is not a nice-to-have -- it is the entire value proposition. It must work well from day one.

2. **Conversation context is the second differentiator.** No competitor maintains state. "Add that one too" is something no existing tool supports. This turns a command interface into a conversation.

3. **Search + Add is the critical path.** Every tool in this space starts here. If search and add do not work smoothly, nothing else matters.

4. **Notifications are expected but not urgent.** Users will tolerate checking status manually at first. Proactive notifications are table stakes for maturity but not for MVP validation.

5. **SMS/RCS is an underserved channel.** Every existing tool is locked to a specific chat platform (Discord, Telegram). SMS works on every phone without installing anything. This is a meaningful distribution advantage.

6. **Simplicity is a feature.** Overseerr requires Plex auth + approval workflows. Requestrr requires Discord bot setup + slash command knowledge. WadsMedia should be: add phone number to whitelist, text the number, done.

## Sources

- Competitor analysis based on training data knowledge of Requestrr, Searcharr, Overseerr, Jellyseerr, and various community Telegram bots for Sonarr/Radarr (MEDIUM confidence -- could not verify against live GitHub repos or documentation due to WebSearch/WebFetch being unavailable)
- Sonarr API documentation (training data, MEDIUM confidence)
- Radarr API documentation (training data, MEDIUM confidence)
- WadsMedia PROJECT.md (HIGH confidence -- read directly from repository)

**Confidence note:** The competitor feature analysis is based on training data from before May 2025. Feature sets may have changed. Requestrr in particular has had intermittent maintenance. Verify current state of competitors if making strategic decisions based on this analysis.

---
*Feature research for: Conversational media server management (Sonarr/Radarr chatbot via messaging)*
*Researched: 2026-02-13*

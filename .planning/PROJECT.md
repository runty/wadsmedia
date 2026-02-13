# WadsMedia

## What This Is

A Docker-based conversational gateway that lets users interact with their Sonarr and Radarr media servers through natural language messaging. Users text the app via a messaging provider (initially Twilio RCS), an LLM interprets the intent, and the app executes the appropriate Sonarr/Radarr API calls — searching for shows/movies, adding them to wanted lists, checking upcoming schedules, and reporting download status. The app also proactively notifies users about events like completed downloads and new episodes.

## Core Value

Users can manage their media libraries through natural conversation — text a message, get things done, no UI to learn.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Natural language messaging interface to Sonarr and Radarr
- [ ] Modular, configurable messaging provider (initial: Twilio RCS)
- [ ] Configurable LLM provider (OpenAI-compatible API)
- [ ] Search for shows/movies by name
- [ ] Add shows/movies to wanted list
- [ ] Remove shows/movies from wanted list
- [ ] View upcoming episode/movie schedule
- [ ] Check download status
- [ ] Smart ambiguity handling (auto-pick if confident, ask user if close matches)
- [ ] Full conversation history per user
- [ ] Multi-user support via phone number whitelist
- [ ] Proactive notifications (downloads complete, new episodes available)
- [ ] Sonarr API integration
- [ ] Radarr API integration
- [ ] Docker deployment with environment variable configuration

### Out of Scope

- Mobile app — messaging-first, no native app needed
- Web dashboard — management happens through conversation
- Self-serve signup — admin whitelists users
- Lidarr/Readarr integration — Sonarr + Radarr only for v1, architecture should allow adding more later
- Media playback — this manages the library, not the player

## Context

- Sonarr and Radarr expose REST APIs for managing TV shows and movies respectively
- Twilio supports RCS messaging which provides richer interactions than SMS
- The messaging provider layer needs to be modular so other providers (Signal, Telegram, Discord, etc.) can be added later
- The LLM provider should accept any OpenAI-compatible API endpoint, allowing use of various models
- The app sits between the messaging provider and the media servers, with the LLM translating natural language to API actions
- Existing code is present in the working directory

## Constraints

- **Deployment**: Must run as Docker container(s)
- **Configuration**: Environment variables for all settings (API keys, server URLs, whitelist)
- **LLM compatibility**: Must work with any OpenAI-compatible API endpoint
- **Messaging modularity**: Provider interface must be abstract enough to swap implementations

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Twilio RCS as initial messaging provider | Rich messaging support, reliable API | — Pending |
| OpenAI-compatible LLM interface | Allows using any compatible provider (OpenAI, local models, etc.) | — Pending |
| Phone number whitelist for auth | Simple, fits messaging-first model, no passwords needed | — Pending |
| Environment variables for config | Standard Docker pattern, simple deployment | — Pending |
| Full conversation history | Enables contextual follow-ups ("add that one too") | — Pending |

---
*Last updated: 2026-02-13 after initialization*

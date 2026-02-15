# Requirements: WadsMedia

**Defined:** 2026-02-14
**Core Value:** Users can manage their media libraries through natural conversation -- text a message, get things done, no UI to learn.

## v2.0 Requirements

Requirements for v2.0 Smart Discovery & Admin milestone. Each maps to roadmap phases.

### Discovery

- [ ] **DISC-01**: User can search for media by actor, genre, network, or year via natural language (TMDB Discover API)
- [ ] **DISC-02**: User can find media with vague descriptions when TMDB search fails (web search fallback via Brave Search API)
- [ ] **DISC-03**: User sees enriched metadata (overview, ratings, year, genres) in search results from TMDB

### Plex Integration

- [ ] **PLEX-01**: User is told when media already exists in their Plex library before adding
- [ ] **PLEX-02**: User can see which seasons/episodes are available in Plex for TV shows
- [ ] **PLEX-03**: User can ask what they've been watching and get their personal Tautulli watch history
- [ ] **PLEX-04**: Admin can link WadsMedia users to Plex accounts via the web dashboard

### Admin & Permissions

- [ ] **ADMN-01**: Non-admin users can search, add, view status/upcoming, but cannot remove media
- [ ] **ADMN-02**: Admin receives a text notification when a non-admin user adds media
- [ ] **ADMN-03**: System tracks which user added which shows/movies with timestamps
- [ ] **ADMN-04**: Admin can view and manage users via a web dashboard
- [ ] **ADMN-05**: Admin can view any user's chat history via the web dashboard
- [ ] **ADMN-06**: Admin can see request counts, recent activity, and system health on the dashboard

### Library Routing

- [ ] **ROUT-01**: Anime series are auto-detected from metadata and routed to the anime root folder in Sonarr
- [ ] **ROUT-02**: Asian-language movies are auto-detected and routed to the CMovies root folder in Radarr
- [ ] **ROUT-03**: User can override auto-detected routing (e.g., "add this to the anime library" or "put this in the regular movies folder")
- [ ] **ROUT-04**: System defaults to 1080p quality profile, only changing when user explicitly requests a different quality

### Messaging & Personality

- [ ] **MSG-01**: Search results display as RCS rich cards with poster images and details
- [ ] **MSG-02**: Quick-action suggested reply buttons appear for common actions (Add this, Next result, Check Plex)
- [ ] **MSG-03**: Assistant has a fun, edgy, and slightly spicy personality with emojis in all responses

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Extended Integrations

- **INTG-01**: Lidarr integration for music library management
- **INTG-02**: Readarr integration for book library management
- **INTG-03**: Additional messaging providers (Telegram, Discord, Signal)

### Advanced Features

- **ADVN-01**: Contextual recommendations ("People who like X also watch Y")
- **ADVN-02**: Multiple Sonarr/Radarr instance support (4K + 1080p)
- **ADVN-03**: Usage analytics dashboard (what users ask for most, failure patterns)
- **ADVN-04**: Per-user request quotas and rate limiting

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Mobile app | Messaging-first, no native app needed |
| Self-serve user signup | Admin whitelists users via dashboard |
| Media playback control | This manages the library, not the player |
| Voice interface | Text messaging is the sweet spot |
| OAuth/SSO for dashboard | Simple auth sufficient for admin-only interface |
| Sonarr/Radarr admin settings via dashboard | Use native UIs for server configuration |
| Real-time chat/WebSocket in dashboard | htmx polling sufficient for admin use |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DISC-01 | Phase 9 | Done |
| DISC-02 | Phase 9 | Done |
| DISC-03 | Phase 9 | Done |
| PLEX-01 | Phase 11 | Pending |
| PLEX-02 | Phase 11 | Pending |
| PLEX-03 | Phase 11 | Pending |
| PLEX-04 | Phase 12 | Pending |
| ADMN-01 | Phase 10 | Done |
| ADMN-02 | Phase 10 | Done |
| ADMN-03 | Phase 10 | Done |
| ADMN-04 | Phase 12 | Pending |
| ADMN-05 | Phase 12 | Pending |
| ADMN-06 | Phase 12 | Pending |
| ROUT-01 | Phase 9 | Done |
| ROUT-02 | Phase 9 | Done |
| ROUT-03 | Phase 9 | Done |
| ROUT-04 | Phase 9 | Done |
| MSG-01 | Phase 13 | Pending |
| MSG-02 | Phase 13 | Pending |
| MSG-03 | Phase 13 | Pending |

**Coverage:**
- v2.0 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-02-14*
*Last updated: 2026-02-14 after roadmap creation*

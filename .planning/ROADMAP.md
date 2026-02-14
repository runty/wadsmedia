# Roadmap: WadsMedia

## Milestones

- v1.0 MVP -- Phases 1-8 (shipped 2026-02-14)
- v2.0 Smart Discovery & Admin -- Phases 9-13 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-8) -- SHIPPED 2026-02-14</summary>

- [x] Phase 1: Foundation (3/3 plans) -- completed 2026-02-14
- [x] Phase 2: Messaging Gateway (2/2 plans) -- completed 2026-02-14
- [x] Phase 3: User Management (2/2 plans) -- completed 2026-02-14
- [x] Phase 4: Media Server Clients (3/3 plans) -- completed 2026-02-14
- [x] Phase 5: Conversation Engine (3/3 plans) -- completed 2026-02-14
- [x] Phase 6: Search and Discovery (2/2 plans) -- completed 2026-02-14
- [x] Phase 7: Library Management (2/2 plans) -- completed 2026-02-13
- [x] Phase 8: Status and Notifications (2/2 plans) -- completed 2026-02-14

Full details: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

### v2.0 Smart Discovery & Admin (In Progress)

**Milestone Goal:** Transform WadsMedia from a basic command proxy into an intelligent media assistant with TMDB/Plex awareness, smart library routing, role-based access, a web admin dashboard, and rich RCS messaging.

- [x] **Phase 9: TMDB Discovery + Library Routing** - Intelligent media search and automatic library organization -- completed 2026-02-14
- [ ] **Phase 10: Permissions + User Tracking** - Role-based access control and per-user request accountability
- [ ] **Phase 11: Plex + Tautulli Integration** - Library awareness and watch history
- [ ] **Phase 12: Web Admin Dashboard** - Visual management interface for admins
- [ ] **Phase 13: RCS Rich Messaging + Personality** - Visual search results and assistant character

## Phase Details

### Phase 9: TMDB Discovery + Library Routing
**Goal**: Users can discover media through natural language queries (by actor, genre, network, year, or vague description) and media is automatically routed to the correct library folder
**Depends on**: v1.0 complete (existing search/add tools, Sonarr/Radarr clients)
**Requirements**: DISC-01, DISC-02, DISC-03, ROUT-01, ROUT-02, ROUT-03, ROUT-04
**Success Criteria** (what must be TRUE):
  1. User can ask "show me sci-fi movies from the 90s" or "what has Oscar Isaac been in" and get relevant TMDB results with metadata (ratings, overview, year, genres)
  2. User can describe media vaguely ("that movie where the guy relives the same day") and get correct results via web search fallback when TMDB structured search fails
  3. Anime series are automatically detected and routed to the anime root folder when added via Sonarr, without user intervention
  4. Asian-language movies are automatically detected and routed to the CMovies root folder when added via Radarr, without user intervention
  5. User can override auto-detected routing ("add this to regular TV" or "put this in the anime library") and system defaults to 1080p quality unless user requests otherwise
**Plans**: 3 plans

Plans:
- [ ] 09-01-PLAN.md -- TMDB client and discover_media tool (wave 1)
- [ ] 09-02-PLAN.md -- Brave Search client and web_search fallback tool (wave 1)
- [ ] 09-03-PLAN.md -- Smart library routing with TDD (wave 2, depends on 09-01)

### Phase 10: Permissions + User Tracking
**Goal**: Non-admin users are restricted from destructive actions, and all media additions are tracked with user attribution
**Depends on**: Phase 9 (modified add tools that routing changed)
**Requirements**: ADMN-01, ADMN-02, ADMN-03
**Success Criteria** (what must be TRUE):
  1. Non-admin user who tries to remove media is blocked at the code level (not just system prompt guidance) and told they lack permission
  2. Admin receives a text notification when a non-admin user adds a show or movie, including what was added and who added it
  3. System records which user added which media with timestamps, queryable for dashboard consumption in Phase 12
**Plans**: 1 plan

Plans:
- [ ] 10-01-PLAN.md -- Permission guard, media tracking table, and admin notification (wave 1)

### Phase 11: Plex + Tautulli Integration
**Goal**: Users have library awareness -- they know what they already have before adding, and can ask about their watch history
**Depends on**: v1.0 complete (independent of Phases 9-10, but ordered after for data flow to dashboard)
**Requirements**: PLEX-01, PLEX-02, PLEX-03
**Success Criteria** (what must be TRUE):
  1. When a user searches for media that already exists in their Plex library, they are told before being offered the option to add it
  2. User can ask about a TV show and see which seasons and episodes are available in Plex (e.g., "You have seasons 1-4, missing season 5")
  3. User can ask "what have I been watching" and get their personal watch history from Tautulli (requires Plex user linking from Phase 12 for per-user history; falls back to global history until linked)
**Plans**: TBD

Plans:
- [ ] 11-01: Plex API client and library cache
- [ ] 11-02: Tautulli client and watch history tool

### Phase 12: Web Admin Dashboard
**Goal**: Admin can manage users, view chat history, see system stats, and link Plex accounts through a web interface
**Depends on**: Phase 10 (media tracking data), Phase 11 (Plex client for user linking)
**Requirements**: ADMN-04, ADMN-05, ADMN-06, PLEX-04
**Success Criteria** (what must be TRUE):
  1. Admin can log into a web dashboard and see a list of all users with the ability to add, edit (admin toggle), or remove users
  2. Admin can click on any user and read their full chat history with the assistant
  3. Admin can see request counts, recent media additions, and system health (Sonarr/Radarr/Plex connectivity) on a dashboard home page
  4. Admin can link a WadsMedia user to their Plex account, enabling per-user watch history in Tautulli queries
**Plans**: TBD

Plans:
- [ ] 12-01: Dashboard backend API and auth
- [ ] 12-02: Dashboard frontend (user management + chat history)
- [ ] 12-03: Dashboard stats and Plex user linking

### Phase 13: RCS Rich Messaging + Personality
**Goal**: Search results are visually rich with poster images and quick-action buttons, and the assistant has a distinct personality
**Depends on**: Phase 9 (TMDB poster URLs), Phase 12 (dashboard for template management, optional)
**Requirements**: MSG-01, MSG-02, MSG-03
**Success Criteria** (what must be TRUE):
  1. Search results display as RCS rich cards with poster images, title, year, and overview (with automatic SMS text fallback on non-RCS devices)
  2. Quick-action suggested reply buttons appear below search results for common actions ("Add this", "Next result", "Check Plex")
  3. Assistant responses use a fun, edgy, slightly spicy personality with emojis throughout all conversations
**Plans**: TBD

Plans:
- [ ] 13-01: RCS content templates and rich card sending
- [ ] 13-02: Suggested reply buttons and personality update

## Progress

**Execution Order:**
Phases execute in numeric order: 9 -> 10 -> 11 -> 12 -> 13

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-02-14 |
| 2. Messaging Gateway | v1.0 | 2/2 | Complete | 2026-02-14 |
| 3. User Management | v1.0 | 2/2 | Complete | 2026-02-14 |
| 4. Media Server Clients | v1.0 | 3/3 | Complete | 2026-02-14 |
| 5. Conversation Engine | v1.0 | 3/3 | Complete | 2026-02-14 |
| 6. Search and Discovery | v1.0 | 2/2 | Complete | 2026-02-14 |
| 7. Library Management | v1.0 | 2/2 | Complete | 2026-02-13 |
| 8. Status and Notifications | v1.0 | 2/2 | Complete | 2026-02-14 |
| 9. TMDB Discovery + Library Routing | v2.0 | 3/3 | Complete | 2026-02-14 |
| 10. Permissions + User Tracking | v2.0 | 0/1 | Planned | - |
| 11. Plex + Tautulli Integration | v2.0 | 0/2 | Not started | - |
| 12. Web Admin Dashboard | v2.0 | 0/3 | Not started | - |
| 13. RCS Rich Messaging + Personality | v2.0 | 0/2 | Not started | - |

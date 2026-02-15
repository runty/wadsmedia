# Roadmap: WadsMedia

## Milestones

- v1.0 MVP -- Phases 1-8 (shipped 2026-02-14)
- v2.0 Smart Discovery & Admin -- Phases 9-13 (shipped 2026-02-15)
- v2.1 Telegram & Polish -- Phases 14-17 (shipped 2026-02-15)
- v2.2 Stability & Polish -- Phases 18-21 (in progress)

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

<details>
<summary>v2.0 Smart Discovery & Admin (Phases 9-13) -- SHIPPED 2026-02-15</summary>

- [x] Phase 9: TMDB Discovery + Library Routing (3/3 plans) -- completed 2026-02-14
- [x] Phase 10: Permissions + User Tracking (2/2 plans) -- completed 2026-02-14
- [x] Phase 11: Plex + Tautulli Integration (2/2 plans) -- completed 2026-02-15
- [x] Phase 12: Web Admin Dashboard (3/3 plans) -- completed 2026-02-15
- [x] Phase 13: RCS Rich Messaging + Personality (2/2 plans) -- completed 2026-02-15

Full details: [milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md)

</details>

<details>
<summary>v2.1 Telegram & Polish (Phases 14-17) -- SHIPPED 2026-02-15</summary>

- [x] Phase 14: Provider Generalization + SMS Polish (3/3 plans) -- completed 2026-02-15
- [x] Phase 15: Telegram DM Integration (3/3 plans) -- completed 2026-02-15
- [x] Phase 16: Telegram Group Chat (2/2 plans) -- completed 2026-02-15
- [x] Phase 17: Admin Dashboard UX Polish (1/1 plan) -- completed 2026-02-15

Full details: [milestones/v2.1-ROADMAP.md](milestones/v2.1-ROADMAP.md)

</details>

### v2.2 Stability & Polish (In Progress)

**Milestone Goal:** Harden conversation reliability, improve LLM response quality, polish notifications and admin experience.

- [x] **Phase 18: Conversation Reliability** - Eliminate orphaned messages, verify deferred persistence, optimize context window for better LLM responses (completed 2026-02-15)
- [ ] **Phase 19: Webhook & Server Resilience** - Auto-recover Telegram webhook after downtime, expose structured health checks
- [ ] **Phase 20: Notification Polish** - Improve formatting per provider, add delivery tracking with retries and failure alerting
- [ ] **Phase 21: Admin Experience** - Dashboard user approval buttons, audit log for user management actions

## Phase Details

### Phase 18: Conversation Reliability
**Goal**: Users get consistently coherent LLM responses without orphaned or confusing message artifacts in their conversation history
**Depends on**: Phase 17 (v2.1 complete)
**Requirements**: CONV-01, CONV-02, CONV-03
**Success Criteria** (what must be TRUE):
  1. Consecutive orphaned user messages (no assistant response between them) are pruned from history before LLM call, so the LLM never sees broken conversation flow
  2. When an LLM call fails or errors out, the user's message is NOT persisted to the database (deferred persistence verified and documented)
  3. The sliding window selects the most relevant recent messages, avoiding patterns that cause the LLM to repeat itself or give confused responses
  4. A user sending multiple messages rapidly (before LLM responds) does not corrupt the conversation context
**Plans:** 2/2 plans complete

Plans:
- [ ] 18-01-PLAN.md -- TDD: Orphaned user message pruning and sliding window optimization
- [ ] 18-02-PLAN.md -- Per-user conversation lock and deferred persistence verification

### Phase 19: Webhook & Server Resilience
**Goal**: The system self-heals after downtime and operators can observe system health at a glance
**Depends on**: Nothing (independent of Phase 18)
**Requirements**: RESIL-01, RESIL-02
**Success Criteria** (what must be TRUE):
  1. After a server restart or downtime, Telegram webhook is automatically re-registered without manual intervention
  2. Health endpoint returns structured status for webhook connectivity, LLM reachability, and recent error rates
  3. If Telegram webhook registration fails, the system retries with backoff and logs the failure clearly
**Plans:** 2 plans

Plans:
- [ ] 19-01-PLAN.md -- Webhook auto-recovery with retry and exponential backoff
- [ ] 19-02-PLAN.md -- Structured health endpoint with webhook, LLM, and error rate checks

### Phase 20: Notification Polish
**Goal**: Proactive notifications look good on every provider and delivery failures are tracked and retried
**Depends on**: Nothing (independent, but benefits from Phase 19 health infrastructure)
**Requirements**: NOTIF-01, NOTIF-02
**Success Criteria** (what must be TRUE):
  1. Telegram notifications render with proper HTML formatting (bold titles, episode/movie details, no raw markdown leaking)
  2. SMS notifications are length-aware: truncated cleanly before carrier limits, with MMS fallback for longer content
  3. Failed notification deliveries are logged with error details, retried at least once, and persistent failures trigger an admin alert
  4. Notification send status (success/failure/retry) is recorded and visible in health checks or logs
**Plans**: TBD

Plans:
- [ ] 20-01: TBD

### Phase 21: Admin Experience
**Goal**: Admins can manage pending users directly from the web dashboard and all user management actions are auditable
**Depends on**: Nothing (independent)
**Requirements**: ADMIN-01, ADMIN-02
**Success Criteria** (what must be TRUE):
  1. Pending users appear in the web dashboard with approve and block buttons that work without page reload
  2. Every user management action (approval, block, removal) is recorded in an audit log with timestamp, admin identity, and action taken
  3. Audit log is viewable in the admin dashboard, showing recent user management history
**Plans**: TBD

Plans:
- [ ] 21-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 18 -> 19 -> 20 -> 21

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
| 10. Permissions + User Tracking | v2.0 | 1/1 | Complete | 2026-02-14 |
| 11. Plex + Tautulli Integration | v2.0 | 2/2 | Complete | 2026-02-15 |
| 12. Web Admin Dashboard | v2.0 | 3/3 | Complete | 2026-02-15 |
| 13. RCS Rich Messaging + Personality | v2.0 | 2/2 | Complete | 2026-02-15 |
| 14. Provider Generalization + SMS Polish | v2.1 | 3/3 | Complete | 2026-02-15 |
| 15. Telegram DM Integration | v2.1 | 3/3 | Complete | 2026-02-15 |
| 16. Telegram Group Chat | v2.1 | 2/2 | Complete | 2026-02-15 |
| 17. Admin Dashboard UX Polish | v2.1 | 1/1 | Complete | 2026-02-15 |
| 18. Conversation Reliability | v2.2 | Complete    | 2026-02-15 | - |
| 19. Webhook & Server Resilience | v2.2 | 0/2 | Not started | - |
| 20. Notification Polish | v2.2 | 0/? | Not started | - |
| 21. Admin Experience | v2.2 | 0/? | Not started | - |

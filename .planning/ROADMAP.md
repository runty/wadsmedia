# Roadmap: WadsMedia

## Milestones

- v1.0 MVP -- Phases 1-8 (shipped 2026-02-14)
- v2.0 Smart Discovery & Admin -- Phases 9-13 (shipped 2026-02-15)
- v2.1 Telegram & Polish -- Phases 14-17 (in progress)

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
- [x] Phase 10: Permissions + User Tracking (1/1 plan) -- completed 2026-02-14
- [x] Phase 11: Plex + Tautulli Integration (2/2 plans) -- completed 2026-02-15
- [x] Phase 12: Web Admin Dashboard (3/3 plans) -- completed 2026-02-15
- [x] Phase 13: RCS Rich Messaging + Personality (2/2 plans) -- completed 2026-02-15

Full details: [milestones/v2.0-ROADMAP.md](milestones/v2.0-ROADMAP.md)

</details>

### v2.1 Telegram & Polish (In Progress)

**Milestone Goal:** Add Telegram as a second messaging channel (DMs + group chat with rich interactions) and polish SMS delivery and admin dashboard UX.

- [x] **Phase 14: Provider Generalization + SMS Polish** (3/3 plans) -- completed 2026-02-15
- [x] **Phase 15: Telegram DM Integration** (3/3 plans) -- completed 2026-02-15
- [ ] **Phase 16: Telegram Group Chat** - Shared context group conversations with selective bot activation
- [ ] **Phase 17: Admin Dashboard UX Polish** - Navigation clarity and Plex linking discoverability

## Phase Details

### Phase 14: Provider Generalization + SMS Polish
**Goal**: The messaging architecture supports multiple providers without SMS-specific assumptions
**Depends on**: Phase 13 (v2.0 complete)
**Requirements**: SMS-01, SMS-02
**Success Criteria** (what must be TRUE):
  1. MMS pixel URL is read from an environment variable, not hardcoded to wadsmedia.runty.net
  2. No dead splitForSms() code remains in the conversation engine
  3. MessagingProvider interface methods are provider-agnostic (no TwiML-specific method names or Twilio-specific fields in shared types)
  4. User model supports optional Telegram user ID alongside phone number (schema migration applied)
**Plans**: 3 plans

Plans:
- [x] 14-01-PLAN.md -- Generalize MessagingProvider interface and update Twilio provider
- [x] 14-02-PLAN.md -- Update engine and all callers to use generalized interface
- [x] 14-03-PLAN.md -- Add Telegram identity columns to user schema

### Phase 15: Telegram DM Integration
**Goal**: Users can chat with the bot via Telegram DM with the same capabilities as SMS
**Depends on**: Phase 14
**Requirements**: TELE-01, TELE-04, TELE-05, TELE-06
**Success Criteria** (what must be TRUE):
  1. User can send a Telegram DM to the bot and receive a response through the conversation engine (search, add, remove, status, upcoming, discover, Plex check, watch history all work)
  2. Search results display poster images inline with the response text in Telegram
  3. Inline keyboard buttons appear for common actions (Add this, Next result, Check Plex) and function correctly when tapped
  4. Telegram user is resolved to a WadsMedia user record, with new users created or linked from Telegram user ID
  5. Bot validates incoming Telegram webhooks with secret token and rejects forged requests
**Plans**: 3 plans

Plans:
- [x] 15-01-PLAN.md -- TelegramMessagingProvider, extended types, and Fastify plugin
- [x] 15-02-PLAN.md -- Telegram webhook route with user resolution and onboarding
- [x] 15-03-PLAN.md -- Provider-aware formatting, multi-provider notifications, admin channel routing

### Phase 16: Telegram Group Chat
**Goal**: Users can interact with the bot in Telegram group chats with shared context and selective activation
**Depends on**: Phase 15
**Requirements**: TELE-02, TELE-03
**Success Criteria** (what must be TRUE):
  1. Bot responds to @mentions in a group chat with full conversational capabilities
  2. Bot detects and responds to obvious media requests in group chat without requiring @mention
  3. Group chat maintains shared conversation context so any member can reference previous search results ("add that one" refers to the last group search)
  4. Each message in group chat is attributed to the correct WadsMedia user
**Plans**: 2 plans

Plans:
- [ ] 16-01-PLAN.md -- Group conversation history schema, engine group mode, and system prompt
- [ ] 16-02-PLAN.md -- Group chat activation filtering and webhook route handler

### Phase 17: Admin Dashboard UX Polish
**Goal**: Admin dashboard navigation and Plex linking are intuitive and transparent
**Depends on**: Phase 14 (independent of Telegram phases, depends only on generalized provider interface)
**Requirements**: ADMN-07, ADMN-08
**Success Criteria** (what must be TRUE):
  1. User detail page is accessible via a clearly labeled link in the user list (not hidden behind "View Chat")
  2. Plex linking section is prominently displayed on the user detail page with clear instructions
  3. When Tautulli is unavailable, Plex linking section shows an explicit error state explaining why linking is unavailable (not silently hidden)
**Plans**: TBD

Plans:
- [ ] 17-01: TBD

## Progress

**Execution Order:**
Phases 14 through 16 execute sequentially (each depends on the previous).
Phase 17 can execute after Phase 14 (independent of Telegram phases 15-16).

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
| 16. Telegram Group Chat | v2.1 | 0/2 | Not started | - |
| 17. Admin Dashboard UX Polish | v2.1 | 0/TBD | Not started | - |

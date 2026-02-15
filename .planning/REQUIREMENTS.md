# Requirements: WadsMedia

**Defined:** 2026-02-15
**Core Value:** Users can manage their media libraries through natural conversation -- text a message, get things done, no UI to learn.

## v2.2 Requirements

Requirements for stability and polish milestone. Each maps to roadmap phases.

### Conversation Reliability

- [ ] **CONV-01**: System prunes orphaned user messages (consecutive user messages with no assistant response) from history before LLM call
- [ ] **CONV-02**: User message is only persisted to DB after LLM responds successfully (deferred persistence)
- [ ] **CONV-03**: Sliding window optimization reduces confused/repetitive LLM responses by improving context selection

### Webhook & Server Resilience

- [ ] **RESIL-01**: Telegram webhook auto-recovers after server downtime (re-register on startup, handle backoff)
- [ ] **RESIL-02**: Structured health checks expose webhook status, LLM connectivity, and error rates

### Notifications

- [ ] **NOTIF-01**: Notification formatting improved for Telegram (HTML) and SMS (length-aware truncation)
- [ ] **NOTIF-02**: Delivery tracking logs send status, retries failed sends, and alerts on persistent failures

### Admin Experience

- [ ] **ADMIN-01**: Web dashboard shows approve/block buttons for pending users (complement LLM tools)
- [ ] **ADMIN-02**: Admin audit log tracks user management actions (approvals, blocks, removals) with timestamps

## v2.1 Requirements (Complete)

- [x] **TELE-01**: User can chat with the bot via Telegram DM
- [x] **TELE-02**: Bot operates in a Telegram group chat with shared conversation context
- [x] **TELE-03**: Bot responds to @mentions and obvious media requests in group chat
- [x] **TELE-04**: Search results display poster images inline in Telegram
- [x] **TELE-05**: Quick-action inline keyboard buttons for common actions
- [x] **TELE-06**: User identity resolved from Telegram user ID and linked to WadsMedia user
- [x] **SMS-01**: MMS pixel.png URL configurable via environment variable
- [x] **SMS-02**: Dead splitForSms() code removed
- [x] **ADMN-07**: User detail page accessible via clearly labeled navigation
- [x] **ADMN-08**: Plex linking section prominently displayed with error states

## Future Requirements

### Extended Integrations

- **INTG-01**: Discord bot integration
- **INTG-02**: Lidarr integration for music library management
- **INTG-03**: Readarr integration for book library management
- **INTG-04**: Multiple Sonarr/Radarr instance support (4K + 1080p)

### Advanced Features

- **ADVN-01**: Contextual recommendations ("People who like X also watch Y")
- **ADVN-02**: Usage analytics dashboard (what users ask for most, failure patterns)
- **ADVN-03**: Per-user request quotas and rate limiting
- **NOTIF-03**: Push notifications via Telegram for download complete events
- **ADMIN-03**: Dashboard chat history search and filtering
- **CONV-04**: Per-user LLM model preference

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile app | Messaging-first, no native app needed |
| Self-serve user signup | Admin whitelists users via dashboard |
| Media playback control | This manages the library, not the player |
| Voice interface | Text messaging is the sweet spot |
| OAuth/SSO for dashboard | Simple auth sufficient for admin-only interface |
| Signal integration | Low priority, Telegram + SMS covers most users |
| WhatsApp integration | Requires Meta Business verification, high barrier |
| Full conversation rewrite/migration | Existing history is fine, just need pruning |
| Multi-LLM routing | Single model sufficient for now |
| Automated testing of LLM responses | Too complex for polish milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONV-01 | Phase 18 | Pending |
| CONV-02 | Phase 18 | Pending (verify existing implementation) |
| CONV-03 | Phase 18 | Pending |
| RESIL-01 | Phase 19 | Pending |
| RESIL-02 | Phase 19 | Pending |
| NOTIF-01 | Phase 20 | Pending |
| NOTIF-02 | Phase 20 | Pending |
| ADMIN-01 | Phase 21 | Pending |
| ADMIN-02 | Phase 21 | Pending |

**Coverage:**
- v2.2 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0

---
*Requirements defined: 2026-02-15*
*Last updated: 2026-02-15 after roadmap creation*

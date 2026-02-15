# Requirements: WadsMedia

**Defined:** 2026-02-15
**Core Value:** Users can manage their media libraries through natural conversation -- text a message, get things done, no UI to learn.

## v2.1 Requirements

Requirements for v2.1 Telegram & Polish milestone. Each maps to roadmap phases.

### Telegram Integration

- [x] **TELE-01**: User can chat with the bot via Telegram DM with the same capabilities as SMS (search, add, remove, status, upcoming, discover, Plex check, watch history)
- [x] **TELE-02**: Bot operates in a Telegram group chat with shared conversation context (anyone can say "add that" and it refers to the last group search)
- [x] **TELE-03**: Bot responds to @mentions and obvious media requests in group chat (not every message)
- [x] **TELE-04**: Search results display poster images inline with response text in Telegram
- [x] **TELE-05**: Quick-action inline keyboard buttons appear for common actions (Add this, Next result, Check Plex)
- [x] **TELE-06**: User identity is resolved from Telegram user ID and linked to existing WadsMedia user record

### SMS/MMS Polish

- [x] **SMS-01**: MMS pixel.png URL is configurable via environment variable (not hardcoded to wadsmedia.runty.net)
- [x] **SMS-02**: Dead splitForSms() code removed from conversation engine

### Admin Dashboard UX

- [x] **ADMN-07**: User detail page is accessible via clearly labeled navigation (not "View Chat")
- [x] **ADMN-08**: Plex linking section is prominently displayed and shows error state when Tautulli is unavailable (not silently hidden)

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Extended Integrations

- **INTG-01**: Discord bot integration
- **INTG-02**: Lidarr integration for music library management
- **INTG-03**: Readarr integration for book library management
- **INTG-04**: Multiple Sonarr/Radarr instance support (4K + 1080p)

### Advanced Features

- **ADVN-01**: Contextual recommendations ("People who like X also watch Y")
- **ADVN-02**: Usage analytics dashboard (what users ask for most, failure patterns)
- **ADVN-03**: Per-user request quotas and rate limiting

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Mobile app | Messaging-first, no native app needed |
| Self-serve user signup | Admin whitelists users via dashboard |
| Media playback control | This manages the library, not the player |
| Voice interface | Text messaging is the sweet spot |
| OAuth/SSO for dashboard | Simple auth sufficient for admin-only interface |
| Signal integration | Low priority, Telegram + SMS covers most users |
| WhatsApp integration | Requires Meta Business verification, high barrier |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TELE-01 | Phase 15 | Complete |
| TELE-02 | Phase 16 | Complete |
| TELE-03 | Phase 16 | Complete |
| TELE-04 | Phase 15 | Complete |
| TELE-05 | Phase 15 | Complete |
| TELE-06 | Phase 15 | Complete |
| SMS-01 | Phase 14 | Complete |
| SMS-02 | Phase 14 | Complete |
| ADMN-07 | Phase 17 | Complete |
| ADMN-08 | Phase 17 | Complete |

**Coverage:**
- v2.1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

---
*Requirements defined: 2026-02-15*
*Last updated: 2026-02-14 after roadmap creation*

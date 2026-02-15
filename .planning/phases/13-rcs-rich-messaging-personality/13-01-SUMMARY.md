---
phase: 13-rcs-rich-messaging-personality
plan: 01
subsystem: messaging
tags: [twilio, rcs, content-templates, rich-cards, quick-reply]

# Dependency graph
requires:
  - phase: 02-messaging-gateway
    provides: "MessagingProvider interface, TwilioMessagingProvider, OutboundMessage/InboundMessage types"
  - phase: 04-media-server-clients
    provides: "Radarr/Sonarr schemas with ImageSchema (coverType, remoteUrl)"
  - phase: 06-search-and-discovery
    provides: "search_movies and search_series tools"
provides:
  - "OutboundMessage with contentSid/contentVariables for Content Template sends"
  - "InboundMessage with buttonPayload/buttonText for quick-reply tap handling"
  - "TwilioMessagingProvider.send() dual-mode: plain text or rich card"
  - "Content template management module (create, get, list, ensure)"
  - "posterUrl in search_movies and search_series results"
affects: [13-02-PLAN, conversation-engine, messaging]

# Tech tracking
tech-stack:
  added: [twilio-content-api]
  patterns: [content-template-idempotent-ensure, dual-mode-send, native-fetch-rest-client]

key-files:
  created:
    - src/messaging/content-templates.ts
  modified:
    - src/messaging/types.ts
    - src/messaging/twilio-provider.ts
    - src/conversation/tools/search-movies.ts
    - src/conversation/tools/search-series.ts

key-decisions:
  - "Native fetch() for Content API (Twilio SDK lacks card creation helpers)"
  - "Idempotent ensureSearchResultTemplate as primary engine entry point"
  - "Quick-reply buttons: Add this / Next result / Check Plex (all under 20-char RCS limit)"

patterns-established:
  - "Dual-mode send: contentSid branch vs body branch in TwilioMessagingProvider"
  - "Idempotent template ensure: list-then-create pattern for Twilio Content Templates"
  - "Poster extraction: images.find(coverType=poster).remoteUrl from Radarr/Sonarr"

# Metrics
duration: 2min
completed: 2026-02-15
---

# Phase 13 Plan 01: RCS Rich Messaging Infrastructure Summary

**Extended messaging types for RCS rich cards with Content Template sends, button interaction capture, content template CRUD via Twilio Content API, and posterUrl in all search tool results**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-15T02:36:42Z
- **Completed:** 2026-02-15T02:38:54Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- OutboundMessage supports contentSid/contentVariables for rich card sends alongside existing body-based plain text
- InboundMessage captures buttonPayload/buttonText from RCS quick-reply taps
- Content template management module with idempotent ensure, CRUD operations, and two template variants (with/without poster)
- All three search-type tools (search_movies, search_series, discover_media) now include posterUrl

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend messaging types and update Twilio provider** - `563a2f5` (feat)
2. **Task 2: Create content template management module** - `8a8f551` (feat)
3. **Task 3: Add posterUrl to search_movies and search_series results** - `8d82c92` (feat)

## Files Created/Modified
- `src/messaging/types.ts` - Extended OutboundMessage (contentSid/contentVariables) and InboundMessage (buttonPayload/buttonText)
- `src/messaging/twilio-provider.ts` - Dual-mode send() branching on contentSid, parseInbound() extracting button fields
- `src/messaging/content-templates.ts` - Content template CRUD via Twilio Content REST API with Basic auth
- `src/conversation/tools/search-movies.ts` - posterUrl from Radarr images array
- `src/conversation/tools/search-series.ts` - posterUrl from Sonarr images array

## Decisions Made
- Used native fetch() for Twilio Content API since the Node SDK lacks complete Content Template card creation helpers
- ensureSearchResultTemplate as the idempotent entry point (list-then-create) avoids duplicate templates
- Quick-reply button titles kept under 20 chars per RCS spec: "Add this" (8), "Next result" (11), "Check Plex" (10)
- Two template variants: with poster media and text-only fallback for null posterUrl cases
- Template includes twilio/text fallback type for SMS recipients who cannot render cards

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required. RCS brand onboarding (noted in STATE.md pending todos) is a prerequisite for sending rich cards in production, but no new env vars are needed for this infrastructure plan.

## Next Phase Readiness
- Messaging infrastructure ready for Plan 13-02 (rich messaging engine)
- Content template module provides ensureSearchResultTemplate for engine integration
- All search tools emit posterUrl for rich card rendering
- Button interaction fields (buttonPayload/buttonText) ready for engine-level handling

## Self-Check: PASSED

All 5 files verified present. All 3 task commits verified in git log.

---
*Phase: 13-rcs-rich-messaging-personality*
*Completed: 2026-02-15*

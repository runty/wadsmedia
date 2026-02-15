---
phase: 13-rcs-rich-messaging-personality
plan: 02
subsystem: conversation
tags: [rich-cards, message-formatter, system-prompt, personality, emoji, rcs]

# Dependency graph
requires:
  - phase: 13-rcs-rich-messaging-personality
    plan: 01
    provides: "OutboundMessage with contentSid, ensureSearchResultTemplate, posterUrl in search results"
  - phase: 05-conversation-engine
    provides: "processConversation orchestrator, tool call loop, system prompt"
provides:
  - "Message formatter that detects search/discover tool results and builds rich card OutboundMessage payloads"
  - "Rich card send integration in processConversation with automatic plain-text fallback"
  - "Fun, edgy, slightly spicy assistant personality (Wads) with emoji usage throughout"
  - "Button tap handling via existing text-based conversation flow (no special routing needed)"
affects: [conversation-engine, messaging]

# Tech tracking
tech-stack:
  added: []
  patterns: [rich-card-send-with-fallback, personality-driven-system-prompt]

key-files:
  created:
    - src/conversation/message-formatter.ts
  modified:
    - src/conversation/engine.ts
    - src/conversation/system-prompt.ts

key-decisions:
  - "Rich card send wraps in try/catch with plain-text fallback -- user always gets a response"
  - "Button taps handled naturally as typed text (no special engine routing needed)"
  - "Personality rewrite preserves all operational tool instructions verbatim"

patterns-established:
  - "Rich card send with fallback: attempt content template send, catch errors, fall through to body-based send"
  - "extractLatestSearchResult scans tool messages backward for results array with title + tmdbId/tvdbId"

# Metrics
duration: 2min
completed: 2026-02-15
---

# Phase 13 Plan 02: Rich Messaging Engine & Personality Summary

**Message formatter wiring search/discover results into RCS rich cards with poster images, quick-reply buttons, and plain-text fallback, plus Wads personality rewrite with emoji-flavored responses**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-15T02:41:05Z
- **Completed:** 2026-02-15T02:43:18Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Message formatter that scans tool call history for search/discover results and builds rich card OutboundMessage with content template SID and variables
- Conversation engine integration: rich card send attempted first with automatic plain-text fallback on any failure
- System prompt rewritten with Wads personality: sharp-tongued, movie-obsessed, fun, slightly spicy, emoji-flavored -- all operational instructions preserved

## Task Commits

Each task was committed atomically:

1. **Task 1: Create message formatter and wire into conversation engine** - `b7346e8` (feat)
2. **Task 2: Rewrite system prompt with fun, edgy personality** - `9693899` (feat)

## Files Created/Modified
- `src/conversation/message-formatter.ts` - formatAsRichCard and extractLatestSearchResult for detecting search results and building rich card payloads
- `src/conversation/engine.ts` - Rich card send integration with try/catch fallback to plain text in processConversation
- `src/conversation/system-prompt.ts` - Wads personality: fun, edgy, slightly spicy with emoji guidance, all tool instructions preserved

## Decisions Made
- Rich card send wraps in try/catch and falls back to plain text -- ensures the user always gets a response even if template creation fails or Twilio Content API is down
- Button taps are handled naturally through existing text-based conversation flow; Twilio sends button title as Body field which the LLM processes from conversation context
- Personality rewrite changes only tone/framing sections; all tool-specific operational instructions (search behavior, library management, routing, confirmation, discovery, web search, Plex, watch history, downloads, permissions) preserved verbatim

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict undefined check in extractLatestSearchResult**
- **Found during:** Task 1 (message formatter creation)
- **Issue:** Array indexing `messages[i]` returns `T | undefined` under strict mode, causing TS18048 errors
- **Fix:** Cast to `ChatCompletionMessageParam | undefined` and added explicit `!msg` guard
- **Files modified:** src/conversation/message-formatter.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** b7346e8 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor TypeScript strictness fix. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no new environment variables or external service configuration required. RCS brand onboarding (noted in STATE.md pending todos) is a prerequisite for sending rich cards in production.

## Next Phase Readiness
- Phase 13 complete: RCS rich messaging infrastructure and personality fully wired
- Search/discover results sent as rich cards when content templates are configured
- Plain-text fallback ensures backward compatibility with SMS-only recipients
- Assistant personality is engaging and emoji-flavored while maintaining all operational instructions
- v1.0 milestone complete

## Self-Check: PASSED

All 3 files verified present. All 2 task commits verified in git log.

---
*Phase: 13-rcs-rich-messaging-personality*
*Completed: 2026-02-15*

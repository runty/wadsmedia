---
phase: 16-telegram-group-chat
plan: 01
subsystem: conversation
tags: [group-chat, drizzle, sqlite, conversation-history, system-prompt, telegram]

# Dependency graph
requires:
  - phase: 15-telegram-dm-integration
    provides: "Telegram provider, DM conversation flow, system prompt addendum pattern"
provides:
  - "messages table with groupChatId column for shared group conversation history"
  - "saveGroupMessage and getGroupHistory functions for group context"
  - "processConversation group mode via groupChatId parameter"
  - "GROUP_CHAT_ADDENDUM system prompt for multi-user LLM guidance"
  - "replyToMessageId threading support in OutboundMessage and TelegramMessagingProvider"
affects: [16-02, telegram-webhook, group-chat-routing]

# Tech tracking
tech-stack:
  added: []
  patterns: [group-mode-branching-in-engine, sender-attribution-prefix, reply-threading]

key-files:
  created: [drizzle/0006_hard_redwing.sql]
  modified:
    - src/db/schema.ts
    - src/conversation/history.ts
    - src/conversation/types.ts
    - src/conversation/engine.ts
    - src/conversation/system-prompt.ts
    - src/messaging/types.ts
    - src/messaging/telegram-provider.ts

key-decisions:
  - "User messages prefixed with [SenderName] for group attribution rather than separate metadata field"
  - "getHistory filtered to groupChatId IS NULL to prevent group messages leaking into DM history"
  - "buildSystemPrompt extended with opts parameter (isGroup, senderName) rather than separate function"
  - "replyToMessageId passed through OutboundMessage to TelegramMessagingProvider reply_parameters"

patterns-established:
  - "Group mode branching: isGroupChat boolean derived from groupChatId presence gates all group-specific logic"
  - "Sender attribution: [Username]: message prefix pattern in stored content for LLM context"
  - "System prompt composition: base + provider addendum + group addendum + sender/user name (all additive)"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 16 Plan 01: Group Conversation History Summary

**Shared group conversation history with per-groupChatId storage, sender attribution, reply threading, and group-aware system prompt**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T18:00:34Z
- **Completed:** 2026-02-15T18:03:57Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Messages table extended with nullable groupChatId column for shared group context (null = DM, non-null = group)
- saveGroupMessage and getGroupHistory functions provide group-scoped persistence and retrieval
- processConversation branches on groupChatId: group mode uses shared history, DM mode unchanged
- GROUP_CHAT_ADDENDUM tells the LLM about multi-user context, sender attribution, and concise reply style
- Bot replies in groups thread to the triggering message via reply_parameters

## Task Commits

Each task was committed atomically:

1. **Task 1: Add groupChatId to messages schema and create group history functions** - `2ee4500` (feat)
2. **Task 2: Extend processConversation for group mode and add group system prompt** - `5cd4c81` (feat)

## Files Created/Modified
- `src/db/schema.ts` - Added groupChatId column to messages table
- `drizzle/0006_hard_redwing.sql` - Migration adding group_chat_id column with index
- `src/conversation/types.ts` - Added groupChatId to ChatMessage interface
- `src/conversation/history.ts` - Added saveGroupMessage, getGroupHistory; filtered getHistory to DM-only
- `src/conversation/engine.ts` - Added group mode branching in processConversation with sender attribution
- `src/conversation/system-prompt.ts` - Added GROUP_CHAT_ADDENDUM and opts parameter to buildSystemPrompt
- `src/messaging/types.ts` - Added replyToMessageId to OutboundMessage
- `src/messaging/telegram-provider.ts` - Passes reply_parameters for threading when replyToMessageId set

## Decisions Made
- User messages in group context are prefixed with `[SenderName]: message` for LLM attribution -- simpler than a separate metadata field and visible in raw history
- getHistory now filters `groupChatId IS NULL` to prevent group messages from leaking into DM conversation history (Rule 1 deviation -- correctness fix)
- buildSystemPrompt extended with optional `opts` parameter rather than creating a separate group prompt builder -- keeps the additive composition pattern established in Phase 15
- reply_parameters used for threading (Telegram Bot API native) rather than reply_to_message_id (deprecated parameter)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added groupChatId IS NULL filter to getHistory**
- **Found during:** Task 1 (group history functions)
- **Issue:** Without filtering, getHistory(db, userId) would return both DM and group messages for a user who participates in both, polluting DM conversation context with group chatter
- **Fix:** Added `isNull(messages.groupChatId)` to the where clause of getHistory
- **Files modified:** src/conversation/history.ts
- **Verification:** TypeScript compiles, filter visible in code
- **Committed in:** 2ee4500 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Essential for correctness -- without this fix, DM history would be contaminated by group messages. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema, history functions, engine branching, and system prompt are all ready for Plan 02 to wire up the group chat webhook route
- Plan 02 needs to: detect group vs DM in Telegram webhook, resolve/create users for group senders, pass groupChatId and senderDisplayName to processConversation

## Self-Check: PASSED

All 8 files verified present. Both task commits (2ee4500, 5cd4c81) verified in git log.

---
*Phase: 16-telegram-group-chat*
*Completed: 2026-02-15*

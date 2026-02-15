---
phase: 14-provider-generalization-sms-polish
plan: 03
subsystem: database
tags: [drizzle, sqlite, telegram, schema, migration, user-identity]

# Dependency graph
requires:
  - phase: 03-user-identity
    provides: "Users table with phone-based identity"
provides:
  - "Users table with telegramChatId and telegramUsername columns"
  - "Nullable phone column for Telegram-only users"
  - "findUserByTelegramChatId query function"
  - "ID-based updateUserStatusById and updateDisplayNameById functions"
  - "Drizzle migration 0005 for Telegram columns"
affects: [15-telegram-dm, 16-group-chat]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Provider-agnostic user identity (phone OR telegram)", "ID-based user updates alongside phone-based"]

key-files:
  created:
    - "drizzle/0005_chubby_longshot.sql"
  modified:
    - "src/db/schema.ts"
    - "src/users/user.service.ts"
    - "src/notifications/notify.ts"
    - "src/plugins/webhook.ts"
    - "src/users/onboarding.ts"

key-decisions:
  - "Used type assertions (as string) for phone in SMS-only code paths rather than refactoring callers"
  - "Kept phone-based update functions for backward compatibility; added ID-based alternatives"
  - "Skip Telegram-only users (no phone) in SMS notification broadcast"

patterns-established:
  - "ID-based user updates: updateUserStatusById/updateDisplayNameById for provider-agnostic code"
  - "Nullable phone guard: SMS-path code uses `user.phone as string` assertion"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 14 Plan 03: User Schema Telegram Identity Summary

**Telegram identity columns (telegramChatId, telegramUsername) added to users table with nullable phone, migration generated, and user service extended with Telegram lookup and ID-based updates**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T14:24:44Z
- **Completed:** 2026-02-15T14:28:09Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Users table now supports multi-provider identity (phone for SMS, telegramChatId for Telegram)
- Phone column made nullable to allow future Telegram-only users
- Drizzle migration 0005 generated with SQLite table recreation pattern
- findUserByTelegramChatId function ready for Phase 15 Telegram user resolution
- ID-based update functions added for provider-agnostic user management

## Task Commits

Each task was committed atomically:

1. **Task 1: Update users table schema and generate migration** - `212e007` (feat)
2. **Task 2: Add findUserByTelegramChatId to user service** - `a74ab55` (feat)

## Files Created/Modified
- `src/db/schema.ts` - Added telegramChatId (unique, nullable) and telegramUsername (nullable) columns; removed notNull from phone
- `drizzle/0005_chubby_longshot.sql` - SQLite table recreation migration adding Telegram columns and making phone nullable
- `drizzle/meta/0005_snapshot.json` - Drizzle migration metadata
- `drizzle/meta/_journal.json` - Updated migration journal
- `src/users/user.service.ts` - Added findUserByTelegramChatId, extended createUser/upsertUser with Telegram fields, added updateUserStatusById/updateDisplayNameById
- `src/notifications/notify.ts` - Skip users without phone in SMS notification broadcast
- `src/plugins/webhook.ts` - Type assertion for phone in Twilio webhook (SMS users always have phone)
- `src/users/onboarding.ts` - Type assertion for phone in SMS onboarding path

## Decisions Made
- Used `as string` type assertions for `user.phone` in SMS-only code paths (webhook.ts, onboarding.ts) rather than refactoring all callers to pass phone separately. These paths are guaranteed to have phone since they come through the Twilio webhook.
- Kept existing phone-based update functions (`updateUserStatus`, `updateDisplayName`) for backward compatibility. Added ID-based versions (`updateUserStatusById`, `updateDisplayNameById`) for Phase 15 Telegram onboarding.
- In `notifyAllActiveUsers`, skip users without a phone number rather than failing. Telegram-only users will get notifications through their own channel in Phase 15.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed nullable phone type errors across codebase**
- **Found during:** Task 1 (Schema changes)
- **Issue:** Making phone nullable changed `user.phone` from `string` to `string | null`, causing 6 type errors in notify.ts, webhook.ts, and onboarding.ts
- **Fix:** Added null guard in notify.ts (skip phone-less users), type assertions in webhook.ts and onboarding.ts (SMS users always have phone)
- **Files modified:** src/notifications/notify.ts, src/plugins/webhook.ts, src/users/onboarding.ts
- **Verification:** `npx tsc --noEmit` shows zero errors in these files
- **Committed in:** 212e007 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Expected consequence of making phone nullable. Type-safe null handling was necessary for compilation. No scope creep.

## Issues Encountered
- Pre-existing type errors from Phase 14 plans 01/02 (OutboundMessage/MessagingProvider interface changes) are present in the codebase but unrelated to this plan's changes. Verified by checking errors exist both before and after our changes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema foundation is ready for Phase 15 Telegram DM integration
- findUserByTelegramChatId enables Telegram webhook handler to resolve users
- ID-based update functions enable Telegram onboarding without phone dependency
- Migration will auto-apply on next server start via Drizzle's migrate()

## Self-Check: PASSED

All created/modified files verified present. Both task commits (212e007, a74ab55) verified in git log.

---
*Phase: 14-provider-generalization-sms-polish*
*Completed: 2026-02-15*

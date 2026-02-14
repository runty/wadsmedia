---
phase: 08-status-and-notifications
verified: 2026-02-14T16:10:00Z
status: passed
score: 9/9 must-haves verified
---

# Phase 8: Status and Notifications Verification Report

**Phase Goal:** Users can check on their downloads and receive proactive notifications when media events occur, completing the full media management experience
**Verified:** 2026-02-14T16:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                  | Status     | Evidence                                                                                       |
| --- | -------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| 1   | User can text 'what's downloading?' and receive current queue status with progress    | ✓ VERIFIED | get_download_queue tool exists, calls getQueue(), calculates progress, system prompt mentions |
| 2   | Queue results show human-readable series/movie titles, not numeric IDs or filenames   | ✓ VERIFIED | Sonarr queue enriched with getSeries() Map lookup; Radarr uses record.title                    |
| 3   | Empty queue returns clear 'nothing downloading' message                                | ✓ VERIFIED | Line 92: returns { message: "No active downloads" }                                            |
| 4   | System prompt guides LLM to use queue tool for status queries                         | ✓ VERIFIED | system-prompt.ts lines 42-47: "Download status:" section with get_download_queue guidance     |
| 5   | When Sonarr finishes downloading an episode, all active users receive SMS notification | ✓ VERIFIED | /webhook/sonarr route, formatSonarrNotification, notifyAllActiveUsers with active user query  |
| 6   | When Radarr finishes downloading a movie, all active users receive SMS notification    | ✓ VERIFIED | /webhook/radarr route, formatRadarrNotification, notifyAllActiveUsers with active user query  |
| 7   | Webhook endpoints reject requests with invalid or missing token                        | ✓ VERIFIED | validateToken preHandler checks token, returns 403 if invalid (lines 18-27)                   |
| 8   | Notification messages are short template strings, not LLM-generated                    | ✓ VERIFIED | formatters.ts uses template literals with switch/case on eventType                            |
| 9   | App still starts and works if NOTIFICATION_SECRET not set                              | ✓ VERIFIED | Plugin gracefully skips if TWILIO_PHONE_NUMBER not configured; token check only if secret set |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact                                 | Expected                                                    | Status     | Details                                                                             |
| ---------------------------------------- | ----------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `src/conversation/tools/get-download-queue.ts` | get_download_queue tool definition                          | ✓ VERIFIED | 97 lines, exports getDownloadQueueTool, calls context.sonarr/radarr.getQueue()     |
| `src/conversation/tools/index.ts`              | Barrel re-export including queue tool                       | ✓ VERIFIED | Line 3: exports getDownloadQueueTool                                                |
| `src/conversation/system-prompt.ts`            | System prompt with download status guidance                 | ✓ VERIFIED | Lines 42-47: "Download status:" section with get_download_queue usage guidance     |
| `src/plugins/conversation.ts`                  | Queue tool registered in ToolRegistry                       | ✓ VERIFIED | Line 47: registry.register(getDownloadQueueTool)                                    |
| `src/notifications/types.ts`                   | Sonarr and Radarr webhook payload type definitions          | ✓ VERIFIED | 42 lines, exports SonarrWebhookPayload and RadarrWebhookPayload interfaces         |
| `src/notifications/formatters.ts`              | Template-based notification message formatters              | ✓ VERIFIED | 43 lines, exports formatSonarrNotification and formatRadarrNotification             |
| `src/notifications/notify.ts`                  | Notification dispatcher to all active users                 | ✓ VERIFIED | 42 lines, exports notifyAllActiveUsers, queries users with status='active'          |
| `src/plugins/notifications.ts`                 | Fastify plugin with /webhook/sonarr and /webhook/radarr    | ✓ VERIFIED | 69 lines, defines both routes with validateToken preHandler                        |
| `src/config.ts`                                | NOTIFICATION_SECRET env var in config schema                | ✓ VERIFIED | Line 30: NOTIFICATION_SECRET optional string                                        |
| `src/server.ts`                                | Notifications plugin registered in server                   | ✓ VERIFIED | Line 8: import, Line 48: register(notificationsPlugin)                              |

### Key Link Verification

| From                                    | To                                         | Via                                   | Status     | Details                                                           |
| --------------------------------------- | ------------------------------------------ | ------------------------------------- | ---------- | ----------------------------------------------------------------- |
| get-download-queue.ts                   | SonarrClient.getQueue(), RadarrClient.getQueue() | context.sonarr/radarr.getQueue()      | ✓ WIRED    | Lines 36, 61: calls both getQueue() methods                       |
| conversation.ts                         | get-download-queue.ts                      | registry.register(getDownloadQueueTool) | ✓ WIRED    | Line 47: registered in ToolRegistry                               |
| notifications.ts                        | formatters.ts                              | formatSonarrNotification, formatRadarrNotification | ✓ WIRED    | Lines 32, 51: calls both formatters                               |
| notifications.ts                        | notify.ts                                  | notifyAllActiveUsers                  | ✓ WIRED    | Lines 36, 54: calls dispatcher with db, messaging, config, message, log |
| server.ts                               | notifications.ts                           | fastify.register(notificationsPlugin) | ✓ WIRED    | Line 48: registered after webhook plugin                          |

### Requirements Coverage

| Requirement | Description                                                                  | Status     | Blocking Issue |
| ----------- | ---------------------------------------------------------------------------- | ---------- | -------------- |
| STAT-01     | User can check download progress and queue status                            | ✓ SATISFIED | None           |
| STAT-02     | User can view upcoming episode/movie schedule                                | ✓ SATISFIED | None (Phase 6 get_upcoming_episodes/movies tools) |
| STAT-03     | App proactively notifies users when downloads complete or new episodes available | ✓ SATISFIED | None           |

### Anti-Patterns Found

None detected. All files have substantive implementations with proper error handling, null checks, and no placeholder comments.

### Human Verification Required

#### 1. Download Queue Display

**Test:** Text "what's downloading?" to the app
**Expected:** LLM responds with current queue status showing series/movie titles, episode labels (S01E02), progress percentages, and estimated time remaining. If nothing downloading, responds "nothing is currently downloading"
**Why human:** Requires live Sonarr/Radarr with active downloads and LLM response formatting verification

#### 2. Upcoming Schedule Display

**Test:** Text "what's coming up?" or "what new episodes are releasing?"
**Expected:** LLM responds with upcoming episodes and movies from Sonarr/Radarr calendars
**Why human:** Requires Phase 6 tools verification and LLM response formatting

#### 3. Proactive Download Completion Notification

**Test:** 
1. Configure Sonarr webhook: Settings -> Connect -> + -> Webhook
   - URL: `http://<wadsmedia-host>:3000/webhook/sonarr?token=<NOTIFICATION_SECRET>`
   - Events: On Grab + On Import
2. Add a TV show to Sonarr and wait for download to complete
**Expected:** All active users receive SMS: "Downloaded: <Series Title> S01E02 - <Episode Title>"
**Why human:** Requires external Sonarr configuration, real download event, and SMS receipt verification

#### 4. Proactive Download Grab Notification

**Test:**
1. Configure Radarr webhook: Settings -> Connect -> + -> Webhook
   - URL: `http://<wadsmedia-host>:3000/webhook/radarr?token=<NOTIFICATION_SECRET>`
   - Events: On Grab + On Import
2. Add a movie to Radarr and wait for grab event
**Expected:** All active users receive SMS: "Grabbing: <Movie Title> (2024)"
**Why human:** Requires external Radarr configuration, real grab event, and SMS receipt verification

#### 5. Webhook Token Security

**Test:**
1. Send POST to `/webhook/sonarr` without `?token=` query param
2. Send POST to `/webhook/sonarr?token=invalid`
**Expected:** Both return 403 Forbidden with `{ error: "Invalid token" }`
**Why human:** Requires HTTP client to send malformed requests

#### 6. Graceful Degradation

**Test:** Start app without NOTIFICATION_SECRET or TWILIO_PHONE_NUMBER set
**Expected:** App starts successfully, logs "Notifications disabled: TWILIO_PHONE_NUMBER not configured", no crash
**Why human:** Requires environment variable manipulation and log inspection

---

## Summary

Phase 8 goal **ACHIEVED**. All must-haves verified:

**Plan 08-01 (Download Queue):**
- ✓ get_download_queue tool fetches both Sonarr and Radarr queues with independent error isolation
- ✓ Series title resolution via getSeries() Map lookup (Sonarr) and record.title (Radarr)
- ✓ Progress percentage calculation from size/sizeleft fields with null safety
- ✓ System prompt updated with download status guidance
- ✓ Tool registered in conversation plugin (10th total tool)

**Plan 08-02 (Proactive Notifications):**
- ✓ Sonarr and Radarr webhook payload type definitions (TypeScript interfaces for version resilience)
- ✓ Template-based message formatters for Download and Grab events (concise SMS strings)
- ✓ User notification dispatcher querying active users and sending SMS via existing Twilio infrastructure
- ✓ Fastify plugin with /webhook/sonarr and /webhook/radarr routes, token-secured via preHandler
- ✓ NOTIFICATION_SECRET optional config for webhook authentication
- ✓ Graceful degradation when messaging not configured

**All requirements satisfied:**
- STAT-01: Download queue status tool ✓
- STAT-02: Upcoming schedule (Phase 6 tools) ✓
- STAT-03: Proactive notifications via webhooks ✓

**No gaps found.** All artifacts exist, are substantive (not stubs), and are wired end-to-end. Human verification recommended for live webhook events and SMS delivery, but all automated checks pass.

---

_Verified: 2026-02-14T16:10:00Z_
_Verifier: Claude (gsd-verifier)_

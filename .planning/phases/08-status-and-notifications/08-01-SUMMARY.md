---
phase: 08-status-and-notifications
plan: 01
subsystem: conversation
tags: [sonarr, radarr, download-queue, llm-tools, system-prompt]

# Dependency graph
requires:
  - phase: 04-media-server-clients
    provides: "SonarrClient.getQueue(), RadarrClient.getQueue(), getSeries() for title resolution"
  - phase: 05-conversation-engine
    provides: "defineTool pattern, ToolRegistry, system prompt structure"
  - phase: 06-search-and-discovery
    provides: "Series title resolution via Map lookup pattern (get-upcoming.ts)"
provides:
  - "get_download_queue LLM tool for checking active downloads from Sonarr and Radarr"
  - "System prompt guidance for download status queries"
  - "STAT-01 requirement satisfied (download progress and queue status)"
affects: [08-status-and-notifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-server queue fetch with independent error isolation"
    - "Series title resolution via getSeries() Map for Sonarr queue enrichment"

key-files:
  created:
    - "src/conversation/tools/get-download-queue.ts"
  modified:
    - "src/conversation/tools/index.ts"
    - "src/conversation/system-prompt.ts"
    - "src/plugins/conversation.ts"

key-decisions:
  - "No parameters on get_download_queue -- fetches everything, LLM filters in response"
  - "Sonarr queue enriched with series titles via separate getSeries() call; Radarr queue uses record.title directly (already contains movie title)"
  - "Independent try/catch for each server so one failure does not block the other"

patterns-established:
  - "Queue tool pattern: parallel fetch queue + metadata, Map-based title resolution, progress calculation from size/sizeleft"

# Metrics
duration: 2min
completed: 2026-02-14
---

# Phase 8 Plan 1: Download Queue Status Summary

**get_download_queue LLM tool fetching Sonarr/Radarr queues with progress percentages and series title resolution**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-14T16:02:08Z
- **Completed:** 2026-02-14T16:03:35Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created get_download_queue tool that fetches active downloads from both Sonarr and Radarr
- Progress percentage calculation from size/sizeleft fields with null safety
- Series title resolution for Sonarr queue items (Radarr records already contain movie titles)
- System prompt updated with download status guidance section
- Tool registered in conversation plugin (total: 10 tools)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create get_download_queue tool definition** - `e97b127` (feat)
2. **Task 2: Update system prompt and register queue tool** - `0771e69` (feat)

## Files Created/Modified
- `src/conversation/tools/get-download-queue.ts` - Download queue tool definition with dual-server fetch, progress calculation, error isolation
- `src/conversation/tools/index.ts` - Barrel re-export for getDownloadQueueTool
- `src/conversation/system-prompt.ts` - Added "Download status:" guidance section
- `src/plugins/conversation.ts` - Import and register getDownloadQueueTool (9th feature tool, 10th total)

## Decisions Made
- No parameters on get_download_queue (fetches all active, LLM formats the response)
- Sonarr queue enriched with series titles via parallel getSeries() fetch; Radarr records already have movie title
- Independent try/catch per server so one server being down does not prevent reporting the other

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- STAT-01 (download progress) fully satisfied
- STAT-02 (schedule awareness) confirmed satisfied by Phase 6 tools (get_upcoming_episodes, get_upcoming_movies)
- Ready for Phase 8 Plan 2 (notifications or remaining status features)

## Self-Check: PASSED

All files exist, all commits verified, all exports confirmed.

---
*Phase: 08-status-and-notifications*
*Completed: 2026-02-14*

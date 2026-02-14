# Phase 8: Status and Notifications - Research

**Researched:** 2026-02-13
**Domain:** Download queue status tools, proactive notification service (webhook-driven or polling), user-facing schedule viewing, Sonarr/Radarr event integration
**Confidence:** HIGH

## Summary

Phase 8 completes the WadsMedia experience by adding download status checking (STAT-01) and proactive notifications when media events occur (STAT-03). STAT-02 (schedule viewing) is already fully implemented by the `get_upcoming_episodes` and `get_upcoming_movies` tools from Phase 6 -- no additional work is needed for that requirement.

The download status work is straightforward: both `SonarrClient.getQueue()` and `RadarrClient.getQueue()` already exist with full Zod-validated schemas (`QueuePageSchema` with `QueueRecordSchema`). The work is to create new LLM tools (`get_download_queue_episodes` / `get_download_queue_movies` or a combined `get_download_queue` tool) that call these existing methods and return LLM-friendly summaries. This follows the exact same `defineTool()` pattern used in Phases 6 and 7.

The proactive notification service (STAT-03) is the significant new capability. This requires WadsMedia to detect events in Sonarr/Radarr (downloads completing, new episodes becoming available) and push messages to users without being asked. Two architectural approaches exist:

1. **Webhook-driven (recommended):** Sonarr and Radarr both support configuring webhook connections (Settings > Connect > Webhook) that POST JSON payloads to a URL when events occur. WadsMedia would expose new Fastify routes (`/webhook/sonarr` and `/webhook/radarr`) that receive these payloads and send SMS notifications to all active users. This is real-time, efficient, and the standard integration pattern in the *arr ecosystem.

2. **Polling-based (fallback):** Use `setInterval` or `@fastify/schedule` to periodically call `getQueue()` and compare against last-known state. Detects completed downloads by tracking queue changes. Less immediate, requires state tracking, wastes API calls when nothing changes.

The webhook approach is strongly preferred because Sonarr/Radarr are specifically designed to push notifications this way. However, webhook setup requires the user to manually configure webhook URLs in Sonarr/Radarr (or the app to use the `/api/v3/notification` endpoint to register itself programmatically). Either way, notifications bypass the LLM entirely -- they use simple template strings, not AI generation.

**Primary recommendation:** Create 1-2 download queue tools following existing `defineTool()` patterns, expose Sonarr/Radarr webhook endpoints in Fastify for proactive notifications, format notification messages as simple templates (no LLM), and send via the existing `messaging.send()` infrastructure to all active users.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Existing `ToolRegistry` + `defineTool()` | (Phase 5) | Tool definition for queue status tools | Already built, tested, pattern proven across Phases 6-7 |
| Existing `SonarrClient.getQueue()` | (Phase 4) | Fetch Sonarr download queue | Already built with Zod-validated `QueuePageSchema` |
| Existing `RadarrClient.getQueue()` | (Phase 4) | Fetch Radarr download queue | Already built with Zod-validated `QueuePageSchema` |
| Existing `MessagingProvider.send()` | (Phase 2) | Send outbound SMS notifications | Already built and used throughout the app |
| `zod` | ^4.3.6 (existing) | Tool parameter schemas, webhook payload validation | Already in project |
| `fastify` | ^5.7.4 (existing) | HTTP route handling for webhook endpoints | Already in project |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fastify/schedule` + `toad-scheduler` | latest | Periodic polling fallback | Only if webhook approach is insufficient or as supplement for polling upcoming episodes |
| `drizzle-orm` | ^0.45.1 (existing) | Persist notification state (last seen queue, notification log) | If tracking notification dedup state in DB |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Webhook-driven notifications | Polling with `setInterval` / `@fastify/schedule` | Polling is simpler to set up (no Sonarr/Radarr config needed) but wastes API calls, is less real-time (delay = poll interval), and requires state tracking to detect changes. Webhooks are the standard *arr pattern. |
| Separate episode/movie queue tools | Single combined `get_download_queue` tool | A single tool that queries both queues keeps the tool count manageable. However, if only one server is configured, it should gracefully handle missing clients. A combined tool is recommended for this phase. |
| Template-based notification messages | LLM-generated notification messages | Templates are cheaper, faster, and more predictable. Notifications are predictable events ("Download complete: Breaking Bad S01E01"). No need for LLM generation. This is explicitly called out as an anti-pattern in the architecture research. |
| Auto-registering webhooks via API | Manual webhook configuration by admin | Auto-registration via `/api/v3/notification` POST is possible but complex (need to discover the right JSON schema, handle existing connections, manage lifecycle). Manual setup is simpler and a one-time task. |

**Installation:**
```bash
# No new dependencies required for the webhook approach
# For optional polling fallback:
npm install @fastify/schedule toad-scheduler
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  conversation/
    tools/
      get-download-queue.ts     # NEW: get_download_queue tool
      index.ts                  # (modified) re-export new tool
    system-prompt.ts            # (modified) add queue status guidance
  notifications/
    types.ts                    # NEW: webhook payload types, notification types
    sonarr-webhook.ts           # NEW: Sonarr webhook handler + formatter
    radarr-webhook.ts           # NEW: Radarr webhook handler + formatter
    notify.ts                   # NEW: send notification to all active users
  plugins/
    notifications.ts            # NEW: Fastify plugin registering webhook routes
    conversation.ts             # (modified) register new queue tool
```

### Pattern 1: Download Queue Tool (STAT-01)
**What:** An LLM tool that fetches the current download queue from both Sonarr and Radarr and returns a combined, LLM-friendly summary.
**When to use:** When the user asks "what's downloading?" or "check my queue."

```typescript
// Source: Existing defineTool pattern + SonarrClient.getQueue() + RadarrClient.getQueue()
import { z } from "zod";
import { defineTool } from "../tools.js";

export const getDownloadQueueTool = defineTool(
  "get_download_queue",
  "Check the current download queue for active and pending downloads. Shows what media is being downloaded, progress, and estimated time remaining. Use when the user asks about download status, queue, what's downloading, or progress.",
  z.object({}),
  "safe",
  async (_args, context) => {
    const results: { episodes?: unknown[]; movies?: unknown[]; errors?: string[] } = {};
    const errors: string[] = [];

    if (context.sonarr) {
      try {
        const queue = await context.sonarr.getQueue({ pageSize: 20 });
        // Resolve series titles for queue items
        const seriesList = await context.sonarr.getSeries();
        const seriesMap = new Map(seriesList.map((s) => [s.id, s.title]));

        results.episodes = queue.records.map((record) => ({
          title: record.title ?? "Unknown",
          seriesTitle: seriesMap.get(record.seriesId ?? 0) ?? "Unknown Series",
          status: record.status ?? "unknown",
          trackedDownloadState: record.trackedDownloadState ?? null,
          progress: record.size && record.sizeleft
            ? Math.round(((record.size - record.sizeleft) / record.size) * 100)
            : null,
          timeleft: record.timeleft ?? null,
          estimatedCompletionTime: record.estimatedCompletionTime ?? null,
        }));
      } catch {
        errors.push("Could not reach TV server (Sonarr)");
      }
    }

    if (context.radarr) {
      try {
        const queue = await context.radarr.getQueue({ pageSize: 20 });
        results.movies = queue.records.map((record) => ({
          title: record.title ?? "Unknown",
          status: record.status ?? "unknown",
          trackedDownloadState: record.trackedDownloadState ?? null,
          progress: record.size && record.sizeleft
            ? Math.round(((record.size - record.sizeleft) / record.size) * 100)
            : null,
          timeleft: record.timeleft ?? null,
          estimatedCompletionTime: record.estimatedCompletionTime ?? null,
        }));
      } catch {
        errors.push("Could not reach movie server (Radarr)");
      }
    }

    if (!context.sonarr && !context.radarr) {
      return { error: "No media servers configured" };
    }

    return {
      ...(results.episodes?.length ? { episodes: results.episodes } : {}),
      ...(results.movies?.length ? { movies: results.movies } : {}),
      ...(errors.length ? { errors } : {}),
      ...(!(results.episodes?.length || results.movies?.length) && !errors.length
        ? { message: "No active downloads" }
        : {}),
    };
  },
);
```

### Pattern 2: Sonarr/Radarr Webhook Receiver (STAT-03)
**What:** Fastify route handlers that receive webhook POSTs from Sonarr/Radarr when events occur (downloads complete, episodes imported, etc.) and send SMS notifications to active users.
**When to use:** For proactive notifications -- the core of STAT-03.

```typescript
// Source: Sonarr/Radarr webhook event types from source code analysis
// Route: POST /webhook/sonarr
fastify.post("/webhook/sonarr", async (request, reply) => {
  const payload = request.body as SonarrWebhookPayload;
  const eventType = payload.eventType;

  let message: string | null = null;

  switch (eventType) {
    case "Download": {
      const series = payload.series?.title ?? "Unknown Show";
      const episode = payload.episodes?.[0];
      const epInfo = episode
        ? `S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")} - ${episode.title ?? ""}`
        : "";
      message = payload.isUpgrade
        ? `Upgraded: ${series} ${epInfo}`
        : `Downloaded: ${series} ${epInfo}`;
      break;
    }
    case "Grab": {
      const series = payload.series?.title ?? "Unknown Show";
      message = `Grabbing: ${series} - sent to download client`;
      break;
    }
    // Ignore other events (Rename, Health, Test, etc.)
  }

  if (message) {
    await notifyAllActiveUsers(message);
  }

  reply.code(200).send({ ok: true });
});
```

### Pattern 3: Notification Dispatcher
**What:** A function that sends an outbound message to all active users via the messaging provider. Used by webhook handlers.
**When to use:** Whenever a proactive notification needs to be sent.

```typescript
// Source: Existing user.service.ts + messaging provider patterns
import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";

async function notifyAllActiveUsers(
  db: DB,
  messaging: MessagingProvider,
  config: AppConfig,
  message: string,
  log: FastifyBaseLogger,
): Promise<void> {
  const activeUsers = db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.status, "active"))
    .all();

  for (const user of activeUsers) {
    try {
      await messaging.send({
        to: user.phone,
        body: message,
        from: config.TWILIO_PHONE_NUMBER,
      });
    } catch (err) {
      log.error({ err, phone: user.phone }, "Failed to send notification");
    }
  }
}
```

### Pattern 4: Notification Fastify Plugin
**What:** A Fastify plugin that registers webhook routes for Sonarr and Radarr notifications.
**When to use:** Always -- this is the main infrastructure for STAT-03.

```typescript
// Source: Existing plugin pattern (plugins/webhook.ts, plugins/messaging.ts)
import fp from "fastify-plugin";

export default fp(
  async (fastify) => {
    // POST /webhook/sonarr -- receives Sonarr event notifications
    fastify.post("/webhook/sonarr", async (request, reply) => {
      // Parse payload, format message, notify users
      // ...
      reply.code(200).send({ ok: true });
    });

    // POST /webhook/radarr -- receives Radarr event notifications
    fastify.post("/webhook/radarr", async (request, reply) => {
      // Parse payload, format message, notify users
      // ...
      reply.code(200).send({ ok: true });
    });

    fastify.log.info("Notification webhook routes registered");
  },
  { name: "notifications", dependencies: ["database", "messaging"] },
);
```

### Anti-Patterns to Avoid
- **Using the LLM for notifications:** Notifications are predictable template events. Running them through the LLM wastes money, adds latency, and risks hallucination. Use simple template strings.
- **Polling when webhooks are available:** Both Sonarr and Radarr natively support push-based webhook notifications. Polling adds unnecessary load, latency (min = poll interval), and state tracking complexity.
- **Sending notifications for every event type:** Not all events are user-relevant. Ignore Rename, Health, ApplicationUpdate, ManualInteractionRequired. Focus on Download (import complete) and optionally Grab.
- **Not deduplicating notifications:** If both Sonarr sends a Grab and then a Download event for the same episode, the user may get two messages. Consider a simple cooldown or dedup mechanism (optional for MVP).
- **Requiring authentication on webhook endpoints:** The Sonarr/Radarr webhook endpoints are called by local-network servers. Full Twilio-style signature validation is not possible here. However, a shared secret or API key query parameter is recommended to prevent external abuse.
- **Forgetting to handle missing messaging config:** If TWILIO_PHONE_NUMBER is not set, the notification send will fail silently. Check config before attempting to send.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Download queue API calls | Custom HTTP queue endpoints | `SonarrClient.getQueue()` / `RadarrClient.getQueue()` | Already built with pagination, sorting, Zod validation |
| User lookup for notifications | Custom user query logic | `db.select().from(users).where(eq(users.status, "active"))` | Standard Drizzle query; user schema already exists |
| Outbound message sending | Custom SMS integration | `messaging.send()` via Twilio provider | Already built and used throughout the app |
| Webhook payload parsing | Manual JSON field extraction | Zod schemas for webhook payloads | Consistent with project pattern; validates incoming data |
| Tool registration and execution | Custom tool routing | `ToolRegistry.register()` + existing tool loop | Phase 5 infrastructure handles everything |
| Progress percentage calculation | Complex download progress tracking | `Math.round(((size - sizeleft) / size) * 100)` from queue record | Sonarr/Radarr already provide size and sizeleft fields |

**Key insight:** STAT-01 is a thin tool definition (like Phase 6/7). STAT-02 is already done. STAT-03 is the only significant new infrastructure -- webhook receiver routes and a notification dispatcher. No new dependencies are needed for the recommended approach.

## Common Pitfalls

### Pitfall 1: STAT-02 Already Implemented
**What goes wrong:** Planning and building schedule viewing tools that already exist.
**Why it happens:** STAT-02 ("User can view upcoming episode/movie schedule") is listed as a Phase 8 requirement, but `get_upcoming_episodes` and `get_upcoming_movies` tools were already built in Phase 6 (Plan 06-01) and are already registered and working.
**How to avoid:** Verify in Phase 8 planning that STAT-02 is already covered. If any minor enhancement is desired (e.g., combining into a single tool or adjusting output), that is a small tweak, not a new tool build.
**Warning signs:** Creating duplicate upcoming schedule tools.

### Pitfall 2: Webhook Endpoint Security
**What goes wrong:** External actors discover the `/webhook/sonarr` or `/webhook/radarr` endpoints and send fake events, triggering spam notifications to all users.
**Why it happens:** Unlike the Twilio webhook which has signature validation, Sonarr/Radarr webhooks have no built-in request signing.
**How to avoid:** Add a simple shared secret as a query parameter or header. Sonarr/Radarr webhook configuration supports adding custom headers or URL query parameters. Use something like `/webhook/sonarr?token=<NOTIFICATION_SECRET>`. Validate the token in the route handler. This is not cryptographically secure like Twilio signatures, but sufficient for a local-network-only setup.
**Warning signs:** Unexpected notifications, high volume of POST requests to webhook endpoints.

### Pitfall 3: Sonarr Queue Records Missing Title Resolution
**What goes wrong:** Queue records show `seriesId: 123` but no human-readable series title. The LLM response says "Downloading item for series 123."
**Why it happens:** Sonarr `QueueRecordSchema` has `seriesId` and optionally `title` (which is the release title, not the series title). The series name must be resolved separately.
**How to avoid:** Same approach as Phase 6 calendar enrichment: fetch the series list via `getSeries()` and build a `seriesId -> title` map. The queue tool should do this in parallel with the queue fetch.
**Warning signs:** LLM responses showing numeric IDs or release filenames instead of show titles.

### Pitfall 4: Notification Message Too Long for SMS
**What goes wrong:** Notification template includes too much detail, creating long messages that cost multiple SMS segments or are truncated.
**Why it happens:** Including full overview, quality details, file paths, etc. in the notification.
**How to avoid:** Keep notification messages under 160 characters. Focus on: what happened + what media. Example: "Downloaded: Breaking Bad S01E01 - Pilot" (44 chars). Do not include quality, file path, or download client details in the notification.
**Warning signs:** Twilio billing shows multi-segment messages, user complaints about verbose notifications.

### Pitfall 5: Webhook Route Conflicts with Existing Twilio Webhook
**What goes wrong:** The new notification routes conflict with the existing `/webhook/twilio` route, or the plugin dependency chain breaks.
**Why it happens:** Both the existing webhook plugin and the new notifications plugin register routes.
**How to avoid:** Use distinct paths: `/webhook/twilio` (existing), `/webhook/sonarr` (new), `/webhook/radarr` (new). The new plugin should declare dependencies on `database` and `messaging` (not on the existing `webhook` plugin). Register the notifications plugin in server.ts alongside other plugins.
**Warning signs:** Plugin registration errors, 404 on new routes, route conflicts.

### Pitfall 6: Sending Notifications Before Messaging is Configured
**What goes wrong:** Webhook handler tries to send notifications but `TWILIO_PHONE_NUMBER` is not set, causing runtime errors.
**Why it happens:** The notification plugin depends on messaging, but TWILIO_PHONE_NUMBER is optional in config.
**How to avoid:** Check `config.TWILIO_PHONE_NUMBER` before attempting to send. If not configured, log a warning and skip the notification. Alternatively, make the notifications plugin skip registration entirely if messaging is not configured (same graceful-skip pattern used by sonarr/radarr/conversation plugins).
**Warning signs:** Unhandled promise rejections in logs, "from" field missing errors from Twilio.

## Code Examples

Verified patterns from the existing codebase and external source analysis.

### Sonarr Webhook Payload Types

```typescript
// Source: Sonarr GitHub source code analysis (WebhookEventType.cs, WebhookImportPayload.cs, WebhookGrabPayload.cs)
// Note: No official JSON schema exists; types derived from source code analysis

// Sonarr event types: Test, Grab, Download, Rename, SeriesAdd, SeriesDelete,
// EpisodeFileDelete, Health, ApplicationUpdate, HealthRestored, ManualInteractionRequired

interface SonarrWebhookPayload {
  eventType: string;  // "Grab" | "Download" | "Test" | etc.
  series?: {
    id: number;
    title: string;
    path: string;
    tvdbId: number;
  };
  episodes?: Array<{
    id: number;
    episodeNumber: number;
    seasonNumber: number;
    title: string;
  }>;
  release?: {
    quality: string;
    releaseGroup: string;
    releaseTitle: string;
    size: number;
  };
  episodeFile?: {
    id: number;
    relativePath: string;
    path: string;
    quality: string;
  };
  isUpgrade?: boolean;
  downloadClient?: string;
  downloadId?: string;
  instanceName?: string;
  applicationUrl?: string;
}
```

### Radarr Webhook Payload Types

```typescript
// Source: Radarr GitHub source code analysis (WebhookEventType.cs)
// Radarr event types: Test, Grab, Download, Rename, MovieDelete, MovieFileDelete,
// Health, ApplicationUpdate, MovieAdded, HealthRestored, ManualInteractionRequired

interface RadarrWebhookPayload {
  eventType: string;  // "Grab" | "Download" | "Test" | etc.
  movie?: {
    id: number;
    title: string;
    year: number;
    releaseDate: string;
    folderPath: string;
    tmdbId: number;
    imdbId: string;
  };
  remoteMovie?: {
    tmdbId: number;
    imdbId: string;
    title: string;
    year: number;
  };
  release?: {
    quality: string;
    releaseGroup: string;
    releaseTitle: string;
    size: number;
  };
  movieFile?: {
    id: number;
    relativePath: string;
    path: string;
    quality: string;
  };
  isUpgrade?: boolean;
  downloadClient?: string;
  downloadId?: string;
  instanceName?: string;
  applicationUrl?: string;
}
```

### Notification Message Formatter

```typescript
// Source: Architecture research anti-pattern guidance (template, not LLM)
function formatSonarrNotification(payload: SonarrWebhookPayload): string | null {
  switch (payload.eventType) {
    case "Download": {
      const series = payload.series?.title ?? "Unknown Show";
      const ep = payload.episodes?.[0];
      const epLabel = ep
        ? `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`
        : "";
      const epTitle = ep?.title ? ` - ${ep.title}` : "";
      const prefix = payload.isUpgrade ? "Upgraded" : "Downloaded";
      return `${prefix}: ${series} ${epLabel}${epTitle}`;
    }
    case "Grab": {
      const series = payload.series?.title ?? "Unknown Show";
      const ep = payload.episodes?.[0];
      const epLabel = ep
        ? `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`
        : "";
      return `Grabbing: ${series} ${epLabel}`;
    }
    default:
      return null;  // Ignore non-user-relevant events
  }
}

function formatRadarrNotification(payload: RadarrWebhookPayload): string | null {
  switch (payload.eventType) {
    case "Download": {
      const title = payload.movie?.title ?? "Unknown Movie";
      const year = payload.movie?.year ? ` (${payload.movie.year})` : "";
      const prefix = payload.isUpgrade ? "Upgraded" : "Downloaded";
      return `${prefix}: ${title}${year}`;
    }
    case "Grab": {
      const title = payload.movie?.title ?? "Unknown Movie";
      return `Grabbing: ${title}`;
    }
    default:
      return null;
  }
}
```

### Complete Webhook Handler

```typescript
// Source: Existing webhook plugin pattern (src/plugins/webhook.ts)
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

export default fp(
  async (fastify: FastifyInstance) => {
    const notificationSecret = fastify.config.NOTIFICATION_SECRET;

    // Validate shared secret
    const validateSecret = async (request: FastifyRequest, reply: FastifyReply) => {
      if (notificationSecret) {
        const token = (request.query as Record<string, string>).token;
        if (token !== notificationSecret) {
          reply.code(403).send({ error: "Invalid token" });
          return;
        }
      }
    };

    fastify.post(
      "/webhook/sonarr",
      { preHandler: [validateSecret] },
      async (request, reply) => {
        const payload = request.body as SonarrWebhookPayload;
        const message = formatSonarrNotification(payload);

        if (message) {
          notifyAllActiveUsers(fastify.db, fastify.messaging, fastify.config, message, request.log)
            .catch((err) => request.log.error({ err }, "Notification dispatch failed"));
        }

        reply.code(200).send({ ok: true });
      },
    );

    // Same pattern for /webhook/radarr

    fastify.log.info("Notification webhook routes registered");
  },
  { name: "notifications", dependencies: ["database", "messaging"] },
);
```

### System Prompt Addition for Queue Status

```typescript
// Add to SYSTEM_PROMPT:
`Download status:
- Use get_download_queue to check what is currently downloading.
- Show download progress as a percentage when available.
- Include estimated time remaining when the data is available.
- If the queue is empty, tell the user nothing is currently downloading.
- Keep queue status responses concise -- list active items with progress, skip completed ones.`
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling Sonarr/Radarr queue endpoints on interval | Webhook-driven push notifications from Sonarr/Radarr | Available since Sonarr v3 / Radarr v3 | Real-time notifications, no wasted API calls, no state tracking needed |
| LLM-generated notification messages | Template-based notification messages | Standard architectural guidance | Cheaper, faster, more predictable, no hallucination risk |
| Single monolithic webhook handler | Separate `/webhook/sonarr` and `/webhook/radarr` routes | Standard pattern in *arr integration tools | Cleaner separation, different payload types, easier to debug |

**Deprecated/outdated:**
- Polling-based notification systems for *arr applications -- webhooks have been the recommended approach since Sonarr/Radarr v3
- Using LLM for formatting notifications -- anti-pattern documented in architecture research

## Open Questions

1. **Webhook security mechanism**
   - What we know: Sonarr/Radarr webhooks do not support signature-based validation like Twilio. They support URL query parameters and custom headers.
   - What's unclear: Whether a simple shared secret is sufficient, or whether IP-based allowlisting should also be used.
   - Recommendation: Use a `NOTIFICATION_SECRET` env var. Add it as a `?token=<secret>` query parameter to the webhook URL configured in Sonarr/Radarr. Validate in the route handler. This is standard for local-network *arr integrations.

2. **Which events to notify on**
   - What we know: Sonarr has 11 event types (Test, Grab, Download, Rename, SeriesAdd, SeriesDelete, EpisodeFileDelete, Health, ApplicationUpdate, HealthRestored, ManualInteractionRequired). Radarr has 11 similar events.
   - What's unclear: Whether users want Grab notifications (media sent to download client) or only Download notifications (import complete), or both.
   - Recommendation: For MVP, notify on `Download` (import complete) only. This is the most meaningful event -- "your media is ready to watch." Optionally include `Grab` with a "downloading" message. Ignore all other events. Make this configurable later if needed.

3. **Notification target: all active users vs. per-user preferences**
   - What we know: The current user model has `status` (active/pending/blocked) but no notification preference field.
   - What's unclear: Whether all active users want all notifications, or whether users should opt in/out.
   - Recommendation: For MVP, notify all active users. This is a household media server -- everyone wants to know when downloads complete. Per-user notification preferences can be added later by extending the users table with a `notificationsEnabled` boolean.

4. **Whether to auto-register webhooks via Sonarr/Radarr API**
   - What we know: Sonarr/Radarr have a `/api/v3/notification` endpoint that can programmatically create connections. The exact request schema is not well-documented.
   - What's unclear: The full JSON body required for the POST, and how to avoid creating duplicate connections on restart.
   - Recommendation: Do NOT auto-register for MVP. Require manual webhook configuration in Sonarr/Radarr. This is a one-time setup and avoids complex API interaction with underdocumented endpoints. Document the setup steps instead.

5. **Sonarr QueueRecordSchema title field semantics**
   - What we know: The Sonarr `QueueRecordSchema` has a `title` field that appears to be the release title (e.g., "Show.Name.S01E01.720p.WEB-DL"), not the human-friendly episode title. The `seriesId` field provides the link to the series, but a series name lookup is needed.
   - What's unclear: Whether the `title` field is always the release title or sometimes the episode title.
   - Recommendation: Always resolve series title via `getSeries()` map lookup (same pattern as Phase 6 calendar). Use the `title` field from the queue record as a fallback label, but prefer the resolved series name for display.

## Sources

### Primary (HIGH confidence)
- Existing codebase (`src/media/sonarr/sonarr.client.ts`) -- `getQueue()` method with `QueuePageSchema` (line 120-129)
- Existing codebase (`src/media/radarr/radarr.client.ts`) -- `getQueue()` method with `QueuePageSchema` (line 126-136)
- Existing codebase (`src/media/sonarr/sonarr.schemas.ts`) -- `QueueRecordSchema` fields: id, seriesId, episodeId, title, size, sizeleft, status, trackedDownloadStatus, trackedDownloadState, timeleft, estimatedCompletionTime
- Existing codebase (`src/media/radarr/radarr.schemas.ts`) -- `QueueRecordSchema` fields: id, movieId, title, size, sizeleft, status, trackedDownloadStatus, trackedDownloadState, timeleft, estimatedCompletionTime, protocol, downloadClient
- Existing codebase (`src/conversation/tools/get-upcoming.ts`) -- STAT-02 already implemented (get_upcoming_episodes, get_upcoming_movies)
- Existing codebase (`src/plugins/webhook.ts`) -- Fastify route handler pattern with preHandler hooks
- Existing codebase (`src/messaging/types.ts`) -- `MessagingProvider.send()` interface for outbound messages
- Existing codebase (`src/users/user.service.ts`) -- User query patterns with Drizzle
- [Sonarr GitHub - WebhookEventType.cs](https://github.com/Sonarr/Sonarr/blob/develop/src/NzbDrone.Core/Notifications/Webhook/WebhookEventType.cs) -- Event type enum values
- [Radarr GitHub - WebhookEventType.cs](https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/Notifications/Webhook/WebhookEventType.cs) -- Event type enum values
- [Sonarr GitHub - WebhookGrabPayload.cs](https://github.com/Sonarr/Sonarr/blob/develop/src/NzbDrone.Core/Notifications/Webhook/WebhookGrabPayload.cs) -- Grab event payload fields
- [Sonarr GitHub - WebhookImportPayload.cs](https://github.com/Sonarr/Sonarr/blob/develop/src/NzbDrone.Core/Notifications/Webhook/WebhookImportPayload.cs) -- Download/Import event payload fields

### Secondary (MEDIUM confidence)
- [eventt Go package](https://pkg.go.dev/github.com/k-x7/eventt) -- Community-derived Sonarr webhook types with field-level detail (GrabEvent, DownloadEvent structs)
- [Brandon B - Setup Sonarr/Radarr to notify via SMS with Twilio](https://brandonb.ca/setup-sonarr-radarr-notify-sms-with-twilio) -- Confirmed webhook approach for SMS notifications, payload structure
- [Home Assistant Community](https://community.home-assistant.io/t/extracting-json-array-value-from-sonarr-webhook/274316) -- Sonarr webhook test payload JSON structure with series, episodes, eventType fields
- [fastify-schedule GitHub](https://github.com/fastify/fastify-schedule) -- Official Fastify plugin for scheduled jobs (fallback option)
- `.planning/research/ARCHITECTURE.md` -- Proactive notification flow diagram showing polling/webhook pattern

### Tertiary (LOW confidence)
- Sonarr/Radarr webhook payload field names beyond the source-code-confirmed ones -- there is no official JSON schema documentation for webhook payloads. Field names are derived from C# property names with PascalCase convention (may change to camelCase in v4 per TODO comments in source)
- Whether `/api/v3/notification` POST can reliably auto-register webhooks -- endpoint exists but request body schema is underdocumented

## Metadata

**Confidence breakdown:**
- Download queue tool (STAT-01): HIGH -- `getQueue()` methods already exist with full schemas; this is a thin defineTool wrapper following the exact Phase 6/7 pattern
- Schedule viewing (STAT-02): HIGH -- already completely implemented in Phase 6; no work needed
- Webhook receiver architecture (STAT-03): HIGH -- standard Fastify route handlers, standard *arr webhook pattern, well-understood from source code
- Webhook payload types (STAT-03): MEDIUM -- derived from source code analysis (C# classes) and community packages, but no official JSON schema exists. PascalCase field names confirmed from source but may change in future versions.
- Notification message formatting: HIGH -- simple template strings, no external dependencies
- Webhook security: MEDIUM -- shared secret approach is standard for local-network *arr integrations but not cryptographically verified

**Research date:** 2026-02-13
**Valid until:** 2026-03-15 (30 days -- *arr webhook formats are stable across minor versions; tool infrastructure is well-established)

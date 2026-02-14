# Phase 10: Permissions + User Tracking - Research

**Researched:** 2026-02-14
**Domain:** Role-based tool access control, per-user media tracking, admin notification on non-admin actions
**Confidence:** HIGH

## Summary

Phase 10 adds three capabilities to the existing tool-loop architecture: (1) permission-gated tool execution that blocks non-admin users from destructive tools at the code level, (2) admin text notifications when non-admin users add media, and (3) a `media_tracking` database table that records who added what and when, queryable for the Phase 12 dashboard.

The existing codebase already has every foundation needed. The `users` table has an `isAdmin` boolean column, seeded from `ADMIN_PHONE` in `user-resolver.ts`. The `ToolDefinition` interface has a `tier` field (safe/destructive) that the tool-loop already checks before execution. The `ToolContext` already carries `userId` and `config` (which contains `ADMIN_PHONE`). The notification infrastructure (`MessagingProvider.send()`) is battle-tested from Phase 2/8. This phase requires no new dependencies -- only modifications to existing types, the tool-loop, the add-tool executors, and a new database table with Drizzle migration.

The critical design decision is WHERE permission checks happen. The ARCHITECTURE.md and PITFALLS.md research both mandate: permission enforcement in the tool-loop execution layer, NOT in the system prompt and NOT in individual tool execute functions. This is a centralized check between Zod validation and the existing destructive-tier check, using a new `requiredRole` field on `ToolDefinition`.

**Primary recommendation:** Extend `ToolDefinition` with `requiredRole`, inject a permission check in `tool-loop.ts` between validation and the destructive check, add `isAdmin`/`displayName`/`userPhone` to `ToolContext`, create a `media_tracking` table, and hook admin notification + tracking into add-tool post-execution flow.

## Standard Stack

### Core

No new libraries needed. Phase 10 uses only existing dependencies.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.45.1 | Schema definition + migration for `media_tracking` table | Already in use for all DB tables |
| better-sqlite3 | ^12.6.2 | SQLite engine for tracking inserts | Already in use as the DB driver |
| zod | ^4.3.6 | Parameter schema for tools (unchanged) | Already in use for all tool definitions |
| twilio | ^5.12.1 | Send admin notification SMS | Already in use for all messaging |

### Supporting

None. No new libraries needed.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Boolean `isAdmin` on users table | Role enum column (`admin`, `member`, `viewer`) | More flexible but unnecessary for two-role system; existing `isAdmin` column works; avoids migration complexity |
| `requiredRole` on ToolDefinition | Per-tool `canExecute(context)` function | More flexible but couples permission logic into each tool; centralized check in tool-loop is cleaner and already recommended by ARCHITECTURE.md |
| Direct SMS to admin phone | Notification queue table + background worker | Over-engineered for 1 admin; direct `messaging.send()` is fast enough and already proven |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure

No new directories. Modifications to existing files only, plus one new utility file.

```
src/
  conversation/
    types.ts              # MODIFY: add requiredRole to ToolDefinition, extend ToolContext
    tools.ts              # MODIFY: add requiredRole param to defineTool()
    tool-loop.ts          # MODIFY: inject permission check before destructive check
    tools/
      add-movie.ts        # MODIFY: insert tracking record + admin notification after successful add
      add-series.ts       # MODIFY: insert tracking record + admin notification after successful add
      remove-movie.ts     # NO CHANGE (already tier: "destructive", just gets requiredRole: "admin")
      remove-series.ts    # NO CHANGE (already tier: "destructive", just gets requiredRole: "admin")
      *.ts                # All other tools: add requiredRole: "any"
    system-prompt.ts      # MODIFY: add permission awareness section
  db/
    schema.ts             # MODIFY: add media_tracking table
  users/
    media-tracking.ts     # NEW: insert/query functions for media_tracking table
  plugins/
    webhook.ts            # MODIFY: pass isAdmin, displayName, userPhone to processConversation
    conversation.ts       # NO CHANGE (tools already registered centrally)
  conversation/
    engine.ts             # MODIFY: pass isAdmin, displayName, userPhone into ToolContext
```

### Pattern 1: Centralized Permission Check in Tool Loop

**What:** A single permission check in `tool-loop.ts` that runs after Zod argument validation and BEFORE the existing destructive-tier check. Checks `tool.requiredRole` against `context.isAdmin`.
**When to use:** Every tool call. The check is universal -- tools are unaware of permissions.

```typescript
// Source: Codebase analysis of src/conversation/tool-loop.ts lines 91-122
// Insert AFTER validation (line 101), BEFORE destructive check (line 104)

// Permission check: block non-admins from admin-only tools
if (tool.requiredRole === 'admin' && !context.isAdmin) {
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    content: JSON.stringify({
      error: 'Permission denied. Only admins can perform this action. You can search, add, and view media, but removing media requires admin access.',
    }),
  });
  continue;
}
```

**Key insight:** The error message goes back to the LLM as a tool result. The LLM then formulates a friendly, conversational response to the user. We do NOT need to craft the end-user message here -- we tell the LLM what happened, and it explains it naturally. This matches the existing pattern for tool errors (e.g., "Movie server (Radarr) is not configured").

### Pattern 2: Post-Execution Hook in Add Tools

**What:** After a successful add operation in `add_movie.ts` / `add_series.ts`, insert a media tracking record and (if non-admin) send admin notification. NOT a separate middleware -- inline in the tool executor.
**When to use:** Only in add-tool executors, only after successful Sonarr/Radarr add.

```typescript
// After successful add, before returning result:

// Track the addition
if (context.db) {
  insertMediaTracking(context.db, {
    userId: context.userId,
    mediaType: 'movie',  // or 'series'
    title: added.title,
    year: added.year ?? null,
    externalId: String(args.tmdbId),  // or tvdbId
    sonarrRadarrId: added.id ?? null,
  });
}

// Notify admin if non-admin user added media
if (!context.isAdmin && context.messaging && context.config?.ADMIN_PHONE) {
  const who = context.displayName || 'A user';
  context.messaging.send({
    to: context.config.ADMIN_PHONE,
    body: `${who} added ${added.title} (${added.year}) [${routingReason}]`,
    from: context.config.TWILIO_PHONE_NUMBER,
  }).catch(() => {}); // Fire-and-forget, don't fail the add
}
```

**Why inline and not middleware:** The add tools need access to the result (title, year, id) for the tracking record and notification. A generic middleware in the tool-loop would not have this data. The tracking/notification logic is specific to add operations. Only two tools need it (add_movie, add_series), so a shared helper function called from both is cleaner than trying to make it generic.

### Pattern 3: ToolContext Extension

**What:** Add `isAdmin`, `displayName`, `userPhone`, `messaging`, and `db` to the `ToolContext` interface so tools can access user identity and services needed for tracking/notification.
**When to use:** Set once when constructing the context in `engine.ts`, consumed by tool executors.

```typescript
// Extended ToolContext
export interface ToolContext {
  sonarr?: SonarrClient;
  radarr?: RadarrClient;
  tmdb?: TmdbClient;
  brave?: BraveSearchClient;
  config?: AppConfig;
  userId: number;
  isAdmin: boolean;              // NEW: from users.isAdmin
  displayName: string | null;    // NEW: from users.displayName
  userPhone: string;             // NEW: from users.phone
  messaging?: MessagingProvider; // NEW: for admin notification
  db?: DB;                       // NEW: for media tracking inserts
}
```

### Anti-Patterns to Avoid

- **Permission check in system prompt only:** The LLM is not a security boundary. Prompt injection can bypass prompt-level guidance. PITFALLS.md explicitly flags this as critical. Enforcement MUST be in the tool-loop code.
- **Permission check inside each tool's execute function:** Duplicates logic across every tool. Easy to forget on new tools. Hard to change policy centrally. ARCHITECTURE.md specifies centralized check in tool-loop.
- **Separate permission middleware in Fastify:** Permissions are tool-level, not HTTP-level. The Twilio webhook is the same for all users. Permission decisions happen inside the conversation engine.
- **Blocking the add operation on notification failure:** Admin notification is best-effort. If Twilio is down, the add still succeeds. Use fire-and-forget (.catch(() => {})) for the notification send.
- **Over-engineering the tracking table:** Phase 12 will query it for the dashboard. Keep it simple: userId, mediaType, title, year, externalId, addedAt. No need for remove tracking, status fields, or JSON metadata blobs at this phase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Database table for tracking | Custom file-based logging | Drizzle schema + SQLite table | Already have the DB infrastructure; file logs are not queryable for dashboard |
| Admin notification delivery | Custom notification queue | Direct `messaging.send()` to ADMIN_PHONE | Only 1 admin, only on adds; queue infrastructure is overkill |
| Role resolution | Custom role service | `users.isAdmin` boolean from DB | Two-role system (admin/not-admin); column already exists |
| Permission DSL | Custom policy engine (like Casbin) | Simple `requiredRole` field on ToolDefinition | Three values: 'admin', 'member', 'any'. A policy engine for 3 values is absurd |

**Key insight:** This phase is intentionally minimal. Every piece of infrastructure already exists. The implementation is wiring -- connecting existing pieces, not building new systems.

## Common Pitfalls

### Pitfall 1: Permission Check Placement Order in tool-loop.ts

**What goes wrong:** Placing the permission check AFTER the destructive-tier check causes non-admin users to get the confirmation prompt ("Are you sure?") for remove operations, then get denied AFTER confirming. This is a terrible UX.
**Why it happens:** The existing destructive check (lines 104-122) is prominent in tool-loop.ts. A developer adds the permission check after it, not before.
**How to avoid:** Permission check MUST come BEFORE the destructive-tier check. The order is: (1) Parse args, (2) Validate args with Zod, (3) Check permissions, (4) Check destructive tier, (5) Execute. Non-admins trying to remove should be denied immediately, never asked to confirm.
**Warning signs:** Non-admin users seeing "Are you sure? (yes/no)" for remove operations before being told they lack permission.

### Pitfall 2: Forgetting to Pass isAdmin Through the Confirmation Flow

**What goes wrong:** The confirmation flow in `engine.ts` (lines 80-133) re-executes tools when the user confirms. The ToolContext constructed there (line 95-101) currently does NOT include `isAdmin`. If a non-admin somehow reaches a pending confirmation for a destructive action (should not happen with correct ordering, but defense in depth), the confirmation execution path would bypass permission checks.
**Why it happens:** `engine.ts` constructs ToolContext in two places: the main flow (line 168) and the confirmation execution (line 95). Developers update one and forget the other.
**How to avoid:** Update BOTH ToolContext construction sites in engine.ts. The confirmation flow ToolContext (line 95-101) must include `isAdmin`, `displayName`, `userPhone`, `messaging`, and `db`.
**Warning signs:** `isAdmin` appears in the main ToolContext but not in the confirmation-path ToolContext.

### Pitfall 3: Notification Blocking the Add Response

**What goes wrong:** Admin notification via `messaging.send()` is awaited, and if Twilio is slow or down, the user's add operation hangs or fails.
**Why it happens:** Developer uses `await messaging.send()` for the notification in the add tool executor.
**How to avoid:** Fire-and-forget pattern: `messaging.send(...).catch(() => {})`. The notification is best-effort. The add operation has already succeeded in Sonarr/Radarr. Log the failure but don't propagate it.
**Warning signs:** Add operations occasionally timing out or failing with Twilio errors even though the media was added to Sonarr/Radarr.

### Pitfall 4: Migration Breaking Existing Data

**What goes wrong:** The new `media_tracking` table is a simple CREATE TABLE -- no existing data to migrate. But the developer might also try to modify the existing `users` table (e.g., adding a `role` column) when `isAdmin` already serves the purpose.
**Why it happens:** Over-engineering. The architecture research mentioned a `role` field, but the implementation section clarified that `isAdmin` boolean is sufficient for the two-role system.
**How to avoid:** Do NOT modify the `users` table. It already has `isAdmin`. Only add the new `media_tracking` table. One migration file, one new table.
**Warning signs:** Migration SQL containing ALTER TABLE on `users`.

### Pitfall 5: requiredRole Default Breaking Existing Tools

**What goes wrong:** Adding `requiredRole` to `ToolDefinition` as a required field means every existing `defineTool()` call must be updated simultaneously. Missing one causes a compile error.
**Why it happens:** TypeScript requires all non-optional fields to be provided.
**How to avoid:** Add `requiredRole` with a default value of `"any"` in the `defineTool()` function signature. This makes the parameter optional with a safe default. Existing tools continue to work without changes. Only destructive tools (`remove_movie`, `remove_series`) need explicit `requiredRole: "admin"`.
**Warning signs:** Compile errors in tool files that were not modified.

## Code Examples

Verified patterns from direct codebase analysis:

### Extending ToolDefinition with requiredRole

```typescript
// Source: src/conversation/types.ts (existing pattern, extended)

export type RequiredRole = 'admin' | 'any';

export interface ToolDefinition {
  definition: ChatCompletionFunctionTool;
  tier: ConfirmationTier;
  requiredRole: RequiredRole;         // NEW
  paramSchema: unknown;
  execute: (args: unknown, context: ToolContext) => Promise<unknown>;
}
```

### Extending defineTool() Function Signature

```typescript
// Source: src/conversation/tools.ts (existing defineTool function, extended)

export function defineTool<T extends z.ZodType>(
  name: string,
  description: string,
  parameters: T,
  tier: ConfirmationTier,
  execute: (args: z.infer<T>, context: ToolContext) => Promise<unknown>,
  requiredRole: RequiredRole = 'any',  // NEW: optional with safe default
): ToolDefinition {
  // ... existing JSON schema conversion ...
  return {
    definition: { type: "function", function: { name, description, parameters: jsonSchema } },
    tier,
    requiredRole,   // NEW
    paramSchema: parameters,
    execute: execute as (args: unknown, context: ToolContext) => Promise<unknown>,
  };
}
```

### Permission Check in tool-loop.ts

```typescript
// Source: src/conversation/tool-loop.ts
// Insert at line 103 (after Zod validation, before destructive check)

// Permission check: block non-admins from admin-only tools
if (tool.requiredRole === 'admin' && !context.isAdmin) {
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    content: JSON.stringify({
      error: 'Permission denied. Only admins can perform this action. You can search, add, and view media, but removing requires admin access.',
    }),
  });
  continue;
}
```

### media_tracking Schema

```typescript
// Source: src/db/schema.ts (new table, follows existing patterns)

export const mediaTracking = sqliteTable('media_tracking', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  mediaType: text('media_type', { enum: ['movie', 'series'] }).notNull(),
  title: text('title').notNull(),
  year: integer('year'),
  externalId: text('external_id').notNull(), // tmdbId for movies, tvdbId for series
  sonarrRadarrId: integer('sonarr_radarr_id'),
  addedAt: integer('added_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

### Media Tracking Insert Function

```typescript
// Source: new file src/users/media-tracking.ts (follows user.service.ts pattern)

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../db/schema.js';
import { mediaTracking } from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export interface TrackingRecord {
  userId: number;
  mediaType: 'movie' | 'series';
  title: string;
  year: number | null;
  externalId: string;
  sonarrRadarrId: number | null;
}

export function insertMediaTracking(db: DB, record: TrackingRecord) {
  return db.insert(mediaTracking).values({
    userId: record.userId,
    mediaType: record.mediaType,
    title: record.title,
    year: record.year,
    externalId: record.externalId,
    sonarrRadarrId: record.sonarrRadarrId,
  }).run();
}
```

### Admin Notification in Add Tool (Post-Execution)

```typescript
// Source: Pattern from src/conversation/tools/add-movie.ts (modify after line 122)
// After the existing return block, before return:

// --- Phase 10: Tracking + Admin Notification ---
// Insert tracking record
if (context.db) {
  const { insertMediaTracking } = await import('../../users/media-tracking.js');
  insertMediaTracking(context.db, {
    userId: context.userId,
    mediaType: 'movie',
    title: added.title,
    year: added.year ?? null,
    externalId: String(args.tmdbId),
    sonarrRadarrId: added.id ?? null,
  });
}

// Notify admin when non-admin adds
if (!context.isAdmin && context.messaging && context.config?.ADMIN_PHONE) {
  const who = context.displayName || 'A user';
  context.messaging.send({
    to: context.config.ADMIN_PHONE,
    body: `${who} added movie: ${added.title} (${added.year})`,
    from: context.config.TWILIO_PHONE_NUMBER,
  }).catch(() => {}); // Fire-and-forget
}
```

### Extended ToolContext in engine.ts

```typescript
// Source: src/conversation/engine.ts line 168 (existing, extended)
context: {
  sonarr,
  radarr,
  tmdb,
  brave,
  config,
  userId,
  isAdmin: /* passed from webhook.ts */,       // NEW
  displayName: /* passed from webhook.ts */,    // NEW
  userPhone,                                     // NEW
  messaging,                                     // NEW
  db,                                            // NEW
},
```

### System Prompt Permission Section

```typescript
// Source: src/conversation/system-prompt.ts (add new section)

// Add after "Library routing:" section:
`
Permissions:
- Some users have admin access and some do not. This is enforced by the system, not by you.
- If a tool call returns a "Permission denied" error, explain to the user that only admins can remove media from the library. Be friendly about it.
- Suggest what they CAN do instead: search, add, view upcoming, check downloads, discover media.
- Never attempt to circumvent permission restrictions.
`
```

### Passing isAdmin from Webhook Through Engine

```typescript
// Source: src/plugins/webhook.ts line 55-70 (existing processConversation call, extended)
// The user object from request.user already has isAdmin field

processConversation({
  userId: user.id,
  userPhone: user.phone,
  displayName: user.displayName,
  isAdmin: user.isAdmin,         // NEW: already on User type from DB
  messageBody: message.body,
  db: fastify.db,
  llmClient: fastify.llm,
  registry: fastify.toolRegistry,
  sonarr: fastify.sonarr,
  radarr: fastify.radarr,
  tmdb: fastify.tmdb,
  brave: fastify.brave,
  messaging: fastify.messaging,
  config: fastify.config,
  log: request.log,
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prompt-based permission guidance | Code-level execution enforcement | Industry consensus 2024-2025 | LLM is translation layer, not security boundary |
| Per-tool permission checks | Centralized pre-execution check | Standard pattern in tool-calling frameworks | Consistent enforcement, impossible to forget on new tools |
| Admin notification via email | SMS to admin phone | WadsMedia design decision | Matches existing messaging-first architecture |

**Deprecated/outdated:**
- Relying on system prompt instructions for access control: Proven ineffective against prompt injection. All major AI agent security research recommends code-level enforcement.

## Detailed File Modification Map

This is the exhaustive list of every file that needs to change, and exactly what changes.

### Files to MODIFY

| File | Change | Lines Affected |
|------|--------|----------------|
| `src/conversation/types.ts` | Add `RequiredRole` type, add `requiredRole` to `ToolDefinition`, add `isAdmin`, `displayName`, `userPhone`, `messaging`, `db` to `ToolContext` | Lines 23-41 |
| `src/conversation/tools.ts` | Add `requiredRole` parameter to `defineTool()` with default `'any'` | Lines 13-37 |
| `src/conversation/tool-loop.ts` | Insert permission check between validation and destructive check | Insert at line 103 |
| `src/conversation/engine.ts` | Add `isAdmin`, `displayName`, `userPhone`, `messaging`, `db` to `ProcessConversationParams`; pass them into ToolContext in both main flow and confirmation flow | Lines 27-42, 95-101, 163-169 |
| `src/plugins/webhook.ts` | Pass `user.isAdmin` to `processConversation()` | Line 55-70 |
| `src/db/schema.ts` | Add `mediaTracking` table definition | Append after line 59 |
| `src/conversation/tools/add-movie.ts` | Add tracking insert + admin notification after successful add | After line 122 |
| `src/conversation/tools/add-series.ts` | Add tracking insert + admin notification after successful add | After line 123 |
| `src/conversation/tools/remove-movie.ts` | Pass `requiredRole: 'admin'` to `defineTool()` | Line 4 |
| `src/conversation/tools/remove-series.ts` | Pass `requiredRole: 'admin'` to `defineTool()` | Line 4 |
| `src/conversation/system-prompt.ts` | Add permissions section to system prompt | After library routing section |

### Files to CREATE

| File | Purpose |
|------|---------|
| `src/users/media-tracking.ts` | `insertMediaTracking()` and `getMediaTrackingByUser()` query functions |

### Files that need NO changes

| File | Why |
|------|-----|
| `src/db/index.ts` | No changes to DB initialization |
| `src/plugins/user-resolver.ts` | Already seeds isAdmin; resolveUser already provides User object with isAdmin |
| `src/users/user.service.ts` | Already handles isAdmin in CRUD |
| `src/users/user.types.ts` | Already types User with isAdmin from schema |
| `src/config.ts` | ADMIN_PHONE already exists; no new env vars needed |
| `src/plugins/conversation.ts` | Tool registration unchanged; requiredRole defaults to 'any' |
| All other tool files | requiredRole defaults to 'any' via defineTool() default parameter |

## Data Flow: Permission Check

```
User sends "remove Breaking Bad" via SMS
  |
  v
webhook.ts: resolveUser -> User { id: 5, isAdmin: false }
  |
  v
engine.ts: processConversation({ ..., isAdmin: false })
  |
  v
engine.ts: builds ToolContext { userId: 5, isAdmin: false, ... }
  |
  v
tool-loop.ts: LLM emits remove_series({ id: 42 })
  |
  v
tool-loop.ts: Zod validation passes
  |
  v
tool-loop.ts: Permission check: tool.requiredRole === 'admin' && !context.isAdmin
  |           YES -> push error result: "Permission denied..."
  v
tool-loop.ts: continue (skip execution, skip destructive check)
  |
  v
LLM receives tool error, generates friendly response:
  "Sorry, only admins can remove shows. Want me to search for something instead?"
```

## Data Flow: Non-Admin Add with Tracking + Notification

```
Non-admin user sends "add Demon Slayer" via SMS
  |
  v
webhook.ts: resolveUser -> User { id: 5, isAdmin: false, displayName: "Sarah" }
  |
  v
engine.ts: ToolContext { userId: 5, isAdmin: false, displayName: "Sarah", messaging, db }
  |
  v
tool-loop.ts: LLM emits add_series({ tvdbId: 345678 })
  |
  v
tool-loop.ts: requiredRole = 'any' -> permission check passes
tool-loop.ts: tier = 'safe' -> destructive check passes
  |
  v
add-series.ts: execute()
  |  1. Sonarr lookup + routing + add (existing flow)
  |  2. insertMediaTracking(db, { userId: 5, mediaType: 'series', title: 'Demon Slayer', ... })
  |  3. messaging.send({ to: ADMIN_PHONE, body: 'Sarah added series: Demon Slayer (2019) [anime]' })
  |     ^ fire-and-forget
  v
Returns success result to LLM -> "Added Demon Slayer and searching for episodes"
```

## Migration Strategy

### Drizzle Migration

Run `npm run db:generate` after adding `mediaTracking` to schema.ts. This produces migration 0003 with a single CREATE TABLE statement:

```sql
CREATE TABLE `media_tracking` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` integer NOT NULL,
  `media_type` text NOT NULL,
  `title` text NOT NULL,
  `year` integer,
  `external_id` text NOT NULL,
  `sonarr_radarr_id` integer,
  `added_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
```

This is an additive migration (new table only). No risk to existing data. Applied automatically on next startup via `migrate()` in `database.ts` plugin.

## Tool Role Assignment Matrix

| Tool | Current Tier | requiredRole | Rationale |
|------|-------------|-------------|-----------|
| `check_status` | safe | any | Everyone can check server status |
| `search_movies` | safe | any | Everyone can search |
| `search_series` | safe | any | Everyone can search |
| `get_upcoming_episodes` | safe | any | Everyone can view upcoming |
| `get_upcoming_movies` | safe | any | Everyone can view upcoming |
| `get_download_queue` | safe | any | Everyone can view downloads |
| `discover_media` | safe | any | Everyone can discover |
| `web_search` | safe | any | Everyone can search the web |
| `add_movie` | safe | any | Everyone can add (admin notified) |
| `add_series` | safe | any | Everyone can add (admin notified) |
| `remove_movie` | destructive | admin | Only admins can remove |
| `remove_series` | destructive | admin | Only admins can remove |

Current tool count: 12 (including `check_status` from createToolRegistry). After Phase 10: still 12. No new tools added.

## Open Questions

1. **Should the system prompt mention permissions?**
   - What we know: PITFALLS.md says prompt is for UX guidance, not enforcement. The permission check is in code.
   - What's unclear: Does the LLM need to be told about permissions to give good UX responses?
   - Recommendation: YES. Add a brief permissions section to the system prompt so the LLM does not suggest "try removing it" to non-admin users. But this is UX polish, not security. If the LLM ignores the prompt and calls remove_series, the code-level check blocks it.

2. **Should admin also receive notifications for their own adds?**
   - What we know: Requirement ADMN-02 says "Admin receives a text notification when a non-admin user adds media". Implies admin's own adds do NOT trigger notification.
   - What's unclear: Nothing -- the requirement is clear.
   - Recommendation: Only notify admin for non-admin adds. `if (!context.isAdmin)` guard on the notification.

3. **Should tracking record `externalId` store tmdbId or tvdbId?**
   - What we know: add_movie uses tmdbId, add_series uses tvdbId. These are different ID systems.
   - What's unclear: Will Phase 12 dashboard need to distinguish?
   - Recommendation: Store whichever ID the tool uses (tmdbId for movies, tvdbId for series). The `mediaType` column disambiguates which ID system it is. Add an `idType` column if this becomes a problem in Phase 12, but it likely won't.

4. **Should remove operations also be tracked?**
   - What we know: ADMN-03 says "tracks which user added which shows/movies." No mention of removes.
   - Recommendation: Track adds only for Phase 10. If Phase 12 dashboard needs remove history, add it then. YAGNI.

## Sources

### Primary (HIGH confidence)

- Codebase analysis: Direct file reads of all 48+ source files in `src/` directory
  - `src/conversation/tool-loop.ts` -- current tool execution flow, destructive check pattern
  - `src/conversation/types.ts` -- current ToolDefinition and ToolContext interfaces
  - `src/conversation/tools.ts` -- current defineTool() and ToolRegistry implementation
  - `src/conversation/engine.ts` -- processConversation and ToolContext construction
  - `src/plugins/webhook.ts` -- user.isAdmin availability from resolveUser
  - `src/db/schema.ts` -- current tables, users.isAdmin column
  - `src/users/user.service.ts` -- isAdmin in CRUD operations
  - `src/config.ts` -- ADMIN_PHONE availability
  - `src/notifications/notify.ts` -- existing notification pattern
  - `src/conversation/tools/add-movie.ts` -- current add flow with routing
  - `src/conversation/tools/add-series.ts` -- current add flow with routing
  - `src/conversation/tools/remove-movie.ts` -- current destructive tier
  - `src/conversation/tools/remove-series.ts` -- current destructive tier
- `.planning/research/ARCHITECTURE.md` -- Permission Guard section, ToolDefinition extension with requiredRole, permission check injection point
- `.planning/research/PITFALLS.md` -- Pitfall 3 (Permission Enforcement Gap), Anti-Pattern 3 (Per-Tool Permission Logic)

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md` -- ADMN-01, ADMN-02, ADMN-03 requirement definitions
- `.planning/ROADMAP.md` -- Phase 10 scope, dependencies on Phase 9

### Tertiary (LOW confidence)

- None. This phase uses only internal codebase patterns and requires no external library research.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing libraries
- Architecture: HIGH -- verified exact file contents, line numbers, and insertion points
- Pitfalls: HIGH -- based on direct code analysis and prior research in ARCHITECTURE.md / PITFALLS.md

**Research date:** 2026-02-14
**Valid until:** No expiry -- internal codebase patterns only, no external APIs or library versions involved

# Architecture Research: v2.0 Integrations & Web Dashboard

**Domain:** Extending conversational media gateway with TMDB/Plex/Tautulli integrations, web admin dashboard, RCS rich messaging, permissions, smart routing, and user media tracking
**Researched:** 2026-02-14
**Confidence:** HIGH (existing codebase analyzed directly; external APIs verified via official documentation)

## Existing Architecture (v1.0 Baseline)

The v2.0 features integrate into a well-structured existing system. Understanding the current architecture is critical for identifying clean integration points.

### Current System Diagram

```
                          EXTERNAL SERVICES
 +-------------+    +-------------+    +-------------+
 |   Twilio    |    | OpenAI-     |    | Sonarr /    |
 |   SMS/RCS   |    | Compatible  |    | Radarr      |
 +------+------+    +------+------+    +------+------+
        |                  |                  |
========|==================|==================|=========
        |        WADSMEDIA CONTAINER          |
        |                  |                  |
 +------v------+    +------v------+    +------v------+
 | Twilio      |    |   OpenAI    |    | Sonarr/     |
 | Provider    |    |   Client    |    | Radarr      |
 | (messaging/)|    | (conversa-  |    | Clients     |
 |             |    |  tion/llm)  |    | (media/)    |
 +------+------+    +------+------+    +------+------+
        |                  |                  |
 +------v------------------v------------------v------+
 |            FASTIFY PLUGIN ARCHITECTURE            |
 |  webhook.ts -> user-resolver -> conversation.ts   |
 +---+----------+----------+----------+----------+--+
     |          |          |          |          |
 +---v---+ +---v---+ +----v---+ +---v---+ +---v----+
 |webhook| | user  | |conver- | |notifi-| |health  |
 |plugin | |resolve| |sation  | |cation | |plugin  |
 |       | |plugin | |plugin  | |plugin | |        |
 +---+---+ +---+---+ +----+---+ +---+---+ +--------+
     |          |          |          |
 +---v----------v----------v----------v---------+
 |        SQLite (better-sqlite3 + Drizzle)     |
 |  users | messages | pending_actions | meta   |
 +-----------------------------------------------+
```

### Key Extension Points Identified

1. **`ToolContext` interface** (`src/conversation/types.ts` line 34-38) -- currently passes `sonarr?`, `radarr?`, `userId`. New clients (TMDB, Plex, Tautulli) add here.
2. **`ToolRegistry`** (`src/conversation/tools.ts`) -- new tools register without modifying existing code. Just call `registry.register()`.
3. **`ProcessConversationParams`** (`src/conversation/engine.ts` line 25-37) -- new clients thread through here.
4. **Fastify plugin pattern** (`src/server.ts`) -- new plugins register via `fastify.register()` with dependency declarations.
5. **`MessagingProvider` interface** (`src/messaging/types.ts`) -- `OutboundMessage` needs extension for RCS content.
6. **DB schema** (`src/db/schema.ts`) -- new tables via Drizzle migrations.
7. **Config** (`src/config.ts`) -- new env vars via Zod schema extension.

## v2.0 Architecture: Integrated System

### Updated System Diagram

```
                              EXTERNAL SERVICES
 +----------+ +----------+ +----------+ +----------+ +----------+
 |  Twilio  | | OpenAI-  | | Sonarr / | |   TMDB   | |  Plex /  |
 |  SMS/RCS | | Compat.  | | Radarr   | |   API    | | Tautulli |
 +----+-----+ +----+-----+ +----+-----+ +----+-----+ +----+-----+
      |             |            |            |            |
======|=============|============|============|============|=====
      |           WADSMEDIA CONTAINER (v2.0)               |
      |             |            |            |            |
 +----v----+  +-----v----+ +----v----+ +-----v----+ +-----v----+
 | Twilio  |  |  OpenAI  | | Sonarr/ | |   TMDB   | |  Plex/   |
 | Provider|  |  Client  | | Radarr  | |  Client  | | Tautulli |
 | (RCS+   |  |          | | Clients | |  (NEW)   | | Clients  |
 |  SMS)   |  |          | |         | |          | |  (NEW)   |
 +----+----+  +-----+----+ +----+----+ +-----+----+ +-----+----+
      |             |            |            |            |
 +----v-------------v------------v------------v------------v----+
 |              FASTIFY PLUGIN ARCHITECTURE                     |
 |                                                              |
 |  MESSAGING LAYER    CONVERSATION LAYER    INTEGRATION LAYER  |
 |  +-----------+      +--------------+      +---------------+  |
 |  | webhook   |      | engine +     |      | tmdb plugin   |  |
 |  | plugin    |      | tool-loop    |      | plex plugin   |  |
 |  | (RCS-     |      | (permissions |      | tautulli      |  |
 |  |  aware)   |      |  -aware)     |      |   plugin      |  |
 |  +-----------+      +--------------+      +---------------+  |
 |                                                              |
 |  USER LAYER         ADMIN LAYER           ROUTING LAYER      |
 |  +-----------+      +--------------+      +---------------+  |
 |  | user-     |      | dashboard    |      | library-      |  |
 |  | resolver  |      | API routes   |      |   router      |  |
 |  | (role-    |      | + static     |      | (anime/lang   |  |
 |  |  aware)   |      |   files      |      |  detection)   |  |
 |  +-----------+      +--------------+      +---------------+  |
 +---+----------+----------+----------+----------+--------------+
     |          |          |          |          |
 +---v----------v----------v----------v----------v-----------+
 |               SQLite (better-sqlite3 + Drizzle)           |
 |  users (+ role) | messages | pending_actions | meta       |
 |  media_tracking | user_plex_links                         |
 +-------------------------------------------------------+
```

### Component Boundaries

| Component | Responsibility | New/Modified | Communicates With |
|-----------|---------------|--------------|-------------------|
| **TMDB Client** | Search movies/TV by structured criteria (actor, genre, network, year, language). Provides metadata enrichment (original language, genres, keywords) for smart routing. | NEW | Tool executors, Library Router |
| **Plex Client** | Check if media exists in Plex library. Get library sections. Verify availability by season/episode for TV. | NEW | Tool executors, Dashboard API |
| **Tautulli Client** | Get watch history per Plex user. Get user watch time stats. Check recently watched/added. | NEW | Tool executors, Dashboard API |
| **Library Router** | Auto-detect anime (via TMDB genre IDs, keywords). Auto-detect Asian-language media (via `original_language`). Route to correct Sonarr/Radarr root folder and quality profile. | NEW | TMDB Client, Sonarr/Radarr Clients |
| **Permission Guard** | Check user role before tool execution. Block destructive tools for non-admins. Emit admin notifications on non-admin adds. | NEW | Tool loop, User service, Messaging |
| **Media Tracker** | Record which user added which media. Query history per user. | NEW | Tool executors (add tools), Dashboard API |
| **Dashboard API** | REST endpoints for user management, chat history, stats, Plex user linking. Serves static SPA files. | NEW | DB, Plex Client, Tautulli Client |
| **Dashboard Frontend** | SPA for admin interface. User list, chat viewer, stats, Plex linking. | NEW | Dashboard API |
| **RCS Messaging** | Extend outbound messages to support rich cards (poster image, title, year) and suggested reply buttons ("Add this", "Next result"). Falls back to plain text for SMS. | MODIFIED | Twilio Content API |
| **Conversation Engine** | Extended to pass new clients to tool context. Permission checks injected into tool loop. | MODIFIED | All clients, Permission Guard |
| **User Service** | Extended with `role` field. Admin vs member distinction replaces boolean `isAdmin`. | MODIFIED | Permission Guard, Dashboard API |
| **Config** | Extended with TMDB, Plex, Tautulli, dashboard env vars. | MODIFIED | All new plugins |
| **System Prompt** | Updated to describe new capabilities (TMDB discovery, Plex checks, permissions). | MODIFIED | Conversation Engine |

## New Components: Detailed Architecture

### 1. TMDB Client (`src/media/tmdb/`)

**Purpose:** Direct TMDB API v3 access for structured discovery that Sonarr/Radarr search cannot do (filter by actor, genre, network, year, original language).

**Architecture decision:** Build a custom thin client using the existing `apiRequest` pattern from `src/media/http.ts` rather than using a third-party library. Rationale: The existing codebase already has a battle-tested HTTP+Zod validation pattern. TMDB's API is simple REST with bearer token auth. A third-party library adds a dependency for no meaningful benefit when you only need 6-8 endpoints.

**Authentication:** Bearer token in `Authorization` header. TMDB API key configured via `TMDB_API_KEY` env var, which TMDB also provides as an access token for bearer auth.

**Rate limits:** ~40-50 requests/second per IP. Not a concern for this use case.

**Key endpoints needed:**

| Endpoint | Purpose | Parameters |
|----------|---------|------------|
| `GET /3/search/movie` | Text search for movies | `query`, `year`, `language` |
| `GET /3/search/tv` | Text search for TV shows | `query`, `first_air_date_year`, `language` |
| `GET /3/search/person` | Find actor/director IDs | `query` |
| `GET /3/discover/movie` | Structured discovery | `with_genres`, `with_cast`, `with_original_language`, `primary_release_year`, `sort_by` |
| `GET /3/discover/tv` | Structured TV discovery | `with_genres`, `with_networks`, `with_original_language`, `first_air_date_year` |
| `GET /3/movie/{id}` | Full movie details | `append_to_response=keywords,credits` |
| `GET /3/tv/{id}` | Full TV details | `append_to_response=keywords,credits` |
| `GET /3/genre/movie/list` | Genre ID mapping | `language` |
| `GET /3/genre/tv/list` | TV genre ID mapping | `language` |
| `GET /3/configuration` | Image base URL | none |

**Adaptation needed for `src/media/http.ts`:** The existing `apiRequest` function hardcodes the `X-Api-Key` header and `/api/v3/` path prefix (Sonarr/Radarr convention). TMDB uses `Authorization: Bearer <token>` and `/3/` prefix. Two options:

- **Option A (recommended):** Create a separate `tmdbRequest` helper in `src/media/tmdb/tmdb.http.ts` that follows the same pattern but with TMDB-specific auth and URL structure. Keep the existing `apiRequest` unchanged.
- **Option B:** Generalize `apiRequest` to accept auth strategy as a parameter. More elegant but risks breaking existing Sonarr/Radarr clients.

**File structure:**
```
src/media/tmdb/
  tmdb.client.ts      # TmdbClient class (same pattern as RadarrClient)
  tmdb.http.ts         # TMDB-specific HTTP helper with bearer auth
  tmdb.schemas.ts      # Zod schemas for TMDB API responses
  tmdb.types.ts        # TypeScript types inferred from schemas
```

**Confidence:** HIGH -- TMDB API v3 is stable, well-documented, and uses standard REST patterns.

### 2. Plex Client (`src/media/plex/`)

**Purpose:** Check if media already exists in the user's Plex library. Get library section metadata. Check season/episode availability for TV.

**Architecture decision:** Custom thin client using `fetch` directly (not reusing `apiRequest` because Plex has a completely different API structure -- XML default, different auth header, different URL paths).

**Authentication:** `X-Plex-Token` header. Token configured via `PLEX_URL` and `PLEX_TOKEN` env vars. Must also send `Accept: application/json` to get JSON responses (Plex defaults to XML).

**Key endpoints needed:**

| Endpoint | Purpose | Notes |
|----------|---------|-------|
| `GET /library/sections` | List all library sections | Returns section IDs and types |
| `GET /library/sections/{id}/all` | All items in a section | Filter with `?title=X` or `?year=Y` |
| `GET /library/metadata/{ratingKey}` | Single item details | Full metadata |
| `GET /library/metadata/{ratingKey}/children` | Seasons of a show | For TV completeness checks |
| `GET /library/metadata/{ratingKey}/children` (season) | Episodes of a season | Nested: show -> seasons -> episodes |
| `GET /search?query=X` | Search across all sections | Quick global search |

**Required headers for all requests:**
```typescript
{
  'X-Plex-Token': token,
  'Accept': 'application/json',
  'X-Plex-Client-Identifier': 'wadsmedia',
  'X-Plex-Product': 'WadsMedia',
  'X-Plex-Version': '2.0.0',
}
```

**File structure:**
```
src/media/plex/
  plex.client.ts      # PlexClient class
  plex.schemas.ts      # Zod schemas for Plex JSON responses
  plex.types.ts        # TypeScript types
```

**Important note:** Plex API responses wrap everything in a `MediaContainer` object. The Zod schemas must account for this wrapper structure.

**Confidence:** HIGH -- Plex API is mature and stable. Endpoint paths confirmed via official documentation and community resources.

### 3. Tautulli Client (`src/media/tautulli/`)

**Purpose:** Watch history awareness. User activity tracking. Recently watched data for recommendation context.

**Architecture decision:** Custom thin client. Tautulli uses a simple single-endpoint API where all commands go to `/api/v2` with `cmd` and `apikey` query parameters.

**Authentication:** API key via `apikey` query parameter. All requests go to one endpoint:
```
GET http://{host}:{port}/api/v2?apikey={key}&cmd={command}&{params}
```

**Key commands needed:**

| Command | Purpose | Key Parameters |
|---------|---------|----------------|
| `get_history` | Watch history with filtering | `user_id`, `media_type`, `length`, `start_date` |
| `get_users` | List all Plex users | none |
| `get_user_watch_time_stats` | User watch statistics | `user_id`, `query_days` |
| `get_recently_added` | Recently added to Plex | `count`, `media_type`, `section_id` |
| `get_activity` | Current active streams | none |

**File structure:**
```
src/media/tautulli/
  tautulli.client.ts   # TautulliClient class
  tautulli.schemas.ts   # Zod schemas for Tautulli responses
  tautulli.types.ts     # TypeScript types
```

**Confidence:** HIGH -- Tautulli API is simple and well-documented.

### 4. Library Router (`src/media/routing/`)

**Purpose:** Automatically detect anime content and Asian-language media, routing them to the correct Sonarr/Radarr root folders and quality profiles.

**Architecture decision:** Pure function that takes TMDB metadata and returns routing decisions. No state, no side effects. Called by the `add_movie` and `add_series` tool executors before passing to Sonarr/Radarr.

**Detection logic:**

For anime detection (Sonarr routing):
```typescript
interface RoutingDecision {
  rootFolderPath: string;
  qualityProfileId: number;
  reason: string;  // For logging/debugging
}

function routeSeries(tmdbMetadata: TmdbSeriesDetail, sonarr: SonarrClient): RoutingDecision {
  const isAnime =
    tmdbMetadata.genres.some(g => g.id === 16) &&  // Animation genre
    tmdbMetadata.origin_country.includes('JP');     // Japanese origin
  // OR: keywords include 'anime'
  // OR: original_language === 'ja' && genre includes Animation

  if (isAnime) {
    return {
      rootFolderPath: findFolderByName(sonarr.rootFolders, 'anime'),
      qualityProfileId: findProfileByName(sonarr.qualityProfiles, 'anime'),
      reason: 'Detected as anime (Japanese animation)',
    };
  }

  return {
    rootFolderPath: sonarr.rootFolders[0].path,  // Default TV folder
    qualityProfileId: findDefault1080pProfile(sonarr.qualityProfiles),
    reason: 'Standard TV series',
  };
}
```

For Asian-language movie detection (Radarr routing):
```typescript
const ASIAN_LANGUAGES = ['zh', 'ja', 'ko', 'th', 'vi', 'id', 'ms', 'tl'];

function routeMovie(tmdbMetadata: TmdbMovieDetail, radarr: RadarrClient): RoutingDecision {
  const isAsianLanguage = ASIAN_LANGUAGES.includes(tmdbMetadata.original_language);

  if (isAsianLanguage) {
    return {
      rootFolderPath: findFolderByName(radarr.rootFolders, 'cmovies'),
      qualityProfileId: findDefault1080pProfile(radarr.qualityProfiles),
      reason: `Asian-language film (${tmdbMetadata.original_language})`,
    };
  }

  return {
    rootFolderPath: radarr.rootFolders[0].path,  // Default Movies folder
    qualityProfileId: findDefault1080pProfile(radarr.qualityProfiles),
    reason: 'Standard movie',
  };
}
```

**Key dependency:** Library router REQUIRES TMDB metadata (original_language, genres, origin_country) to make routing decisions. This means the `add_movie` and `add_series` tools must fetch TMDB details before adding to Sonarr/Radarr, even when the user found the content via Sonarr/Radarr search.

**Configuration:** Root folder name matching is fuzzy (case-insensitive, partial match). Quality profile names are configurable via env vars with sensible defaults. If a configured folder/profile is not found, fall back to the first available option and log a warning.

**File structure:**
```
src/media/routing/
  library-router.ts     # Pure routing functions
  library-router.types.ts  # RoutingDecision type
```

**Confidence:** HIGH -- straightforward data-driven logic. TMDB genre IDs are stable (Animation = 16).

### 5. Permission Guard (`src/users/permissions.ts`)

**Purpose:** Role-based access control for tool execution. Non-admins can search, view, and add, but cannot remove. Admin gets notified when non-admin adds media.

**Architecture decision:** Inject permission checks into the tool call loop, not into individual tools. This keeps tools simple and ensures consistent enforcement.

**Implementation approach:** Extend `ConfirmationTier` to include a `requiredRole` property on `ToolDefinition`:

```typescript
// Extended tool definition
export interface ToolDefinition {
  definition: ChatCompletionFunctionTool;
  tier: ConfirmationTier;
  requiredRole: 'admin' | 'member' | 'any';  // NEW
  paramSchema: unknown;
  execute: (args: unknown, context: ToolContext) => Promise<unknown>;
}
```

The tool loop checks `requiredRole` before executing:
```typescript
// In tool-loop.ts, before execution
if (tool.requiredRole === 'admin' && !context.userRole.isAdmin) {
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    content: JSON.stringify({ error: 'You do not have permission to perform this action.' }),
  });
  continue;
}
```

**Role assignments:**

| Tool | Required Role | Rationale |
|------|--------------|-----------|
| `search_movies`, `search_series` | any | Everyone can search |
| `check_status` | any | Everyone can check status |
| `get_upcoming_*` | any | Everyone can view upcoming |
| `get_download_queue` | any | Everyone can view downloads |
| `add_movie`, `add_series` | any | Members can add (admin notified) |
| `remove_movie`, `remove_series` | admin | Only admins can remove |
| `discover_*` (new TMDB tools) | any | Everyone can discover |
| `check_plex_library` (new) | any | Everyone can check availability |

**Admin notification on non-admin add:** Hook into the add tool executors. After successful add, if `!context.isAdmin`, send a notification to admin:
```
"[User Name] added [Movie/Show Title] (YYYY)"
```

**Schema change:** The `users` table already has `isAdmin` boolean. This is sufficient. No new `role` column needed -- just use the existing boolean. The `ToolDefinition.requiredRole` maps to this:
- `'admin'` = `isAdmin === true`
- `'member'` = `isAdmin === false && status === 'active'`
- `'any'` = `status === 'active'`

**ToolContext extension:**
```typescript
export interface ToolContext {
  sonarr?: SonarrClient;
  radarr?: RadarrClient;
  tmdb?: TmdbClient;       // NEW
  plex?: PlexClient;        // NEW
  tautulli?: TautulliClient; // NEW
  userId: number;
  isAdmin: boolean;          // NEW
  userPhone: string;         // NEW (for admin notification)
  displayName: string | null; // NEW (for admin notification)
}
```

**Confidence:** HIGH -- simple boolean-based authorization, no complex RBAC needed.

### 6. Media Tracker (`src/db/` schema + `src/users/`)

**Purpose:** Record which user added which media. Support dashboard queries for "who added what."

**Schema:**
```typescript
export const mediaTracking = sqliteTable('media_tracking', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  mediaType: text('media_type', { enum: ['movie', 'series'] }).notNull(),
  title: text('title').notNull(),
  year: integer('year'),
  externalId: text('external_id').notNull(),  // tmdbId or tvdbId
  sonarrRadarrId: integer('sonarr_radarr_id'),  // ID in Sonarr/Radarr
  addedAt: integer('added_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

**Integration point:** The `add_movie` and `add_series` tool executors insert a tracking record after successful Sonarr/Radarr add. The context already has `userId`.

**Confidence:** HIGH -- simple insert-after-action pattern.

### 7. Dashboard API (`src/dashboard/`)

**Purpose:** REST API for the web admin dashboard. User management, chat history viewing, stats, Plex user linking.

**Architecture decision:** Register as a Fastify plugin with a `/api/admin/` prefix. Use `@fastify/static` to serve the SPA frontend from the same container.

**Authentication:** Simple token-based auth. Dashboard protected by a `DASHBOARD_SECRET` env var. The admin enters this token in the dashboard login form. Token sent as `Authorization: Bearer <token>` header on all API requests. No sessions, no cookies, no OAuth -- this is a single-admin tool.

**API routes:**

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/admin/auth` | Validate dashboard token |
| `GET` | `/api/admin/users` | List all users with status |
| `PATCH` | `/api/admin/users/:id` | Update user status/role |
| `GET` | `/api/admin/users/:id/messages` | Get user's chat history |
| `GET` | `/api/admin/users/:id/media` | Get user's added media |
| `GET` | `/api/admin/stats` | Dashboard stats (counts, recent activity) |
| `GET` | `/api/admin/stats/activity` | Recent activity feed |
| `POST` | `/api/admin/users/:id/plex-link` | Link Plex user to WadsMedia user |
| `DELETE` | `/api/admin/users/:id/plex-link` | Unlink Plex user |
| `GET` | `/api/admin/plex/users` | List available Plex users (from Tautulli) |

**Plex user linking schema:**
```typescript
export const userPlexLinks = sqliteTable('user_plex_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id).unique(),
  plexUserId: integer('plex_user_id').notNull(),
  plexUsername: text('plex_username').notNull(),
  linkedAt: integer('linked_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

**Static file serving:**
```typescript
// In dashboard plugin
await fastify.register(import('@fastify/static'), {
  root: path.join(__dirname, '../../dashboard/dist'),
  prefix: '/dashboard/',
  wildcard: true,  // SPA routing support
});

// Catch-all for SPA client-side routing
fastify.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/dashboard')) {
    return reply.sendFile('index.html');
  }
  reply.code(404).send({ error: 'Not found' });
});
```

**File structure:**
```
src/dashboard/
  routes.ts           # All API route handlers
  auth.ts             # Token validation middleware
  stats.ts            # Stats aggregation queries
  types.ts            # API request/response types
```

**Confidence:** HIGH -- standard Fastify REST API patterns. `@fastify/static` is the official plugin for serving static files.

### 8. Dashboard Frontend (`dashboard/`)

**Purpose:** Simple admin SPA for user management, chat viewing, and stats.

**Architecture decision:** Separate directory at project root (`dashboard/`), built with Vite, output goes to `dashboard/dist/`. The Docker build compiles it and copies dist into the container.

**Technology choice:** Keep it minimal. React + Vite + Tailwind CSS. No heavy admin framework (Refine, React Admin) -- the dashboard has maybe 5-6 views and does not justify a framework dependency.

**Views:**
1. **Login** -- token entry
2. **Dashboard** -- stats cards (total users, active users, recent requests, media added)
3. **Users** -- table with status, role, last activity, actions (approve/block/promote)
4. **User Detail** -- chat history viewer, media added list, Plex link
5. **Activity** -- recent activity feed (adds, searches, notifications)

**File structure:**
```
dashboard/
  index.html
  src/
    main.tsx
    App.tsx
    api/
      client.ts       # fetch wrapper with auth header
    pages/
      Login.tsx
      Dashboard.tsx
      Users.tsx
      UserDetail.tsx
      Activity.tsx
    components/
      Layout.tsx
      StatsCard.tsx
      ChatHistory.tsx
      UserTable.tsx
  vite.config.ts
  tailwind.config.ts
  tsconfig.json
  package.json
```

**Docker integration:** Multi-stage build adds a dashboard build stage:
```dockerfile
# Stage 1: Build dashboard
FROM node:22-slim AS dashboard-build
WORKDIR /dashboard
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

# Stage 2: Build backend (existing)
FROM node:22-slim AS backend-build
# ... existing build steps ...

# Stage 3: Production
FROM node:22-slim
# ... existing copy steps ...
COPY --from=dashboard-build /dashboard/dist ./dashboard/dist
```

**Confidence:** MEDIUM -- the dashboard architecture is straightforward, but frontend technology choices have more variability. React + Vite + Tailwind is a well-proven combination.

### 9. RCS Rich Messaging (Modified `src/messaging/`)

**Purpose:** Send search results as rich cards with poster images, and provide suggested reply buttons for quick actions.

**Architecture decision:** Use Twilio's Content Template Builder API to create and send rich cards programmatically. Templates are created at startup or on-demand and cached by content type.

**How Twilio Content API works:**
1. Create a content template via `POST https://content.twilio.com/v1/Content` with template type `twilio/card`
2. Get back a `ContentSid` (like `HXXXXXXXXXXX`)
3. Send messages with `contentSid` instead of `body` parameter
4. Templates support variables for dynamic content (`ContentVariables`)

**Key challenge:** Templates must be pre-created and approved by Twilio before sending. For dynamic content like search results, you need to use variables in pre-defined templates.

**Template strategy:**

| Template | Type | Variables | When Used |
|----------|------|-----------|-----------|
| Movie Result Card | `twilio/card` | `{title}`, `{year}`, `{overview}`, `{posterUrl}` | Search results |
| TV Result Card | `twilio/card` | `{title}`, `{year}`, `{overview}`, `{posterUrl}`, `{seasons}` | Search results |
| Quick Reply | `twilio/quick-reply` | `{body}` + actions: "Add this", "More results" | After showing a result |

**Implementation approach:**

```typescript
// Extended OutboundMessage
export interface OutboundMessage {
  to: string;
  body: string;
  messagingServiceSid?: string;
  from?: string;
  // NEW: RCS rich content
  contentSid?: string;
  contentVariables?: Record<string, string>;
}

// In TwilioMessagingProvider.send():
async send(message: OutboundMessage): Promise<SendResult> {
  const createParams: any = {
    to: message.to,
    ...(message.messagingServiceSid
      ? { messagingServiceSid: message.messagingServiceSid }
      : { from: message.from }),
  };

  if (message.contentSid) {
    createParams.contentSid = message.contentSid;
    if (message.contentVariables) {
      createParams.contentVariables = JSON.stringify(message.contentVariables);
    }
    // Do NOT set body when using contentSid
  } else {
    createParams.body = message.body;
  }

  const result = await this.client.messages.create(createParams);
  return { sid: result.sid, status: result.status };
}
```

**Graceful degradation:** When sending to a non-RCS-capable device (SMS only), Twilio automatically falls back to a text-only version of the template. The existing plain text `body` continues to work as-is. The Content API handles this transparently.

**TMDB image URLs for poster images:** TMDB provides poster paths like `/kqjL17yufvn9OVLyXYpvtyrFfak.jpg`. Full URL requires the base URL from `/3/configuration`: `https://image.tmdb.org/t/p/w500{poster_path}`.

**Confidence:** MEDIUM -- Twilio Content API is well-documented, but the template creation/approval workflow needs validation. Templates with variables must be tested end-to-end. The RCS fallback behavior for SMS-only devices needs verification during implementation.

## Data Flow Changes

### New Data Flow: TMDB-Enhanced Search

```
[User: "find action movies with Tom Cruise"]
    |
    v
[LLM identifies structured criteria via tool call]
    | discover_movies({ with_cast: "Tom Cruise", with_genres: "action" })
    v
[Tool executor: resolve "Tom Cruise" -> TMDB person ID]
    | tmdb.searchPerson("Tom Cruise") -> personId: 500
    v
[Tool executor: discover with structured filters]
    | tmdb.discoverMovies({ with_cast: 500, with_genres: 28 })
    v
[Return results with poster URLs, overview, year]
    |
    v
[LLM formats natural language response]
    | Includes TMDB poster URLs for RCS cards
    v
[Send RCS rich card with poster OR plain text for SMS]
```

### New Data Flow: Smart Library Routing on Add

```
[User: "add Demon Slayer"]
    |
    v
[LLM calls add_series({ tvdbId: 345678 })]
    |
    v
[Tool executor: fetch TMDB metadata for routing decision]
    | tmdb.getTvDetails(tmdbId) -> { original_language: "ja", genres: [Animation], origin_country: ["JP"] }
    v
[Library Router: isAnime? YES (Japanese + Animation)]
    | -> rootFolderPath: "/anime/", qualityProfileId: 3
    v
[SonarrClient.addSeries({ rootFolderPath: "/anime/", qualityProfileId: 3, ... })]
    |
    v
[Media Tracker: insert tracking record (userId, "series", "Demon Slayer", tvdbId)]
    |
    v
[If !isAdmin: notify admin "UserName added Demon Slayer (2019)"]
    |
    v
[LLM formats confirmation response]
```

### New Data Flow: Plex Library Check

```
[User: "do I have Breaking Bad?"]
    |
    v
[LLM calls check_plex_library({ title: "Breaking Bad", type: "show" })]
    |
    v
[PlexClient.searchLibrary("Breaking Bad")]
    | -> Found in section "TV Shows", all 5 seasons, 62/62 episodes
    v
[Return structured result to LLM]
    |
    v
[LLM: "Yes! Breaking Bad is in your Plex library with all 5 seasons (62 episodes)."]
```

### New Data Flow: Dashboard API

```
[Admin opens browser to /dashboard/]
    |
    v
[@fastify/static serves SPA index.html + assets]
    |
    v
[SPA: POST /api/admin/auth { token: "..." }]
    | Validate DASHBOARD_SECRET
    v
[SPA: GET /api/admin/stats]
    | Query: user counts, media_tracking counts, recent messages
    v
[SPA: GET /api/admin/users]
    | Query: users table with last message timestamps
    v
[SPA: GET /api/admin/users/3/messages]
    | Query: messages table for userId=3, ordered by createdAt
    v
[Admin: PATCH /api/admin/users/5 { status: "active" }]
    | Update user, effective immediately for next message
```

### Modified Data Flow: Permission-Aware Tool Loop

```
[Existing tool-loop.ts, lines 104-122]
    |
    v
[BEFORE execution, NEW check:]
    if (tool.requiredRole === 'admin' && !context.isAdmin) {
      // Return permission error to LLM
      // LLM tells user they cannot perform this action
    }
    |
    v
[AFTER successful add execution, NEW hook:]
    if (!context.isAdmin && isAddTool(functionName)) {
      // Insert media_tracking record
      // Send admin notification
    }
```

## Modified Components: Specific Changes

### `src/config.ts` -- New Environment Variables

```typescript
// TMDB
TMDB_API_KEY: z.string().min(1).optional(),
TMDB_IMAGE_BASE_URL: z.string().url().default('https://image.tmdb.org/t/p/w500'),

// Plex
PLEX_URL: z.string().url().optional(),
PLEX_TOKEN: z.string().min(1).optional(),

// Tautulli
TAUTULLI_URL: z.string().url().optional(),
TAUTULLI_API_KEY: z.string().min(1).optional(),

// Dashboard
DASHBOARD_SECRET: z.string().min(8).optional(),

// Library routing (folder name hints, case-insensitive)
ANIME_ROOT_FOLDER: z.string().default('anime'),
CMOVIES_ROOT_FOLDER: z.string().default('cmovies'),
DEFAULT_QUALITY_PROFILE: z.string().default('1080p'),

// RCS
TWILIO_CONTENT_MOVIE_CARD_SID: z.string().optional(),
TWILIO_CONTENT_TV_CARD_SID: z.string().optional(),
TWILIO_CONTENT_QUICK_REPLY_SID: z.string().optional(),
```

### `src/conversation/types.ts` -- Extended ToolContext

```typescript
export interface ToolContext {
  sonarr?: SonarrClient;
  radarr?: RadarrClient;
  tmdb?: TmdbClient;           // NEW
  plex?: PlexClient;            // NEW
  tautulli?: TautulliClient;    // NEW
  userId: number;
  isAdmin: boolean;              // NEW
  userPhone: string;             // NEW
  displayName: string | null;    // NEW
}

export interface ToolDefinition {
  definition: ChatCompletionFunctionTool;
  tier: ConfirmationTier;
  requiredRole: 'admin' | 'member' | 'any';  // NEW
  paramSchema: unknown;
  execute: (args: unknown, context: ToolContext) => Promise<unknown>;
}
```

### `src/conversation/tool-loop.ts` -- Permission Check Injection

Insert between argument validation (line 92-101) and destructive tier check (line 104-121):

```typescript
// NEW: Permission check
if (tool.requiredRole === 'admin' && !context.isAdmin) {
  messages.push({
    role: 'tool',
    tool_call_id: toolCall.id,
    content: JSON.stringify({
      error: 'Permission denied. Only admins can perform this action.',
    }),
  });
  continue;
}
```

### `src/server.ts` -- New Plugin Registration

```typescript
// After existing plugins
await fastify.register(tmdbPlugin);
await fastify.register(plexPlugin);
await fastify.register(tautulliPlugin);
await fastify.register(dashboardPlugin);
```

### `src/conversation/system-prompt.ts` -- Updated Capabilities

Add sections for:
- TMDB discovery capabilities (structured search by actor, genre, network, year)
- Plex library checking (verify media exists, check episode completeness)
- Permission awareness ("If you lack permission to remove media, explain and suggest asking an admin")
- Smart routing is transparent to the user (no prompt changes needed, routing is automatic)

## Updated Project Structure (v2.0 additions)

```
src/
  config.ts                          # MODIFIED: new env vars
  server.ts                          # MODIFIED: new plugin registrations
  db/
    schema.ts                        # MODIFIED: new tables
    index.ts                         # unchanged
  media/
    http.ts                          # unchanged (Sonarr/Radarr only)
    errors.ts                        # unchanged
    sonarr/                          # unchanged
    radarr/                          # unchanged
    tmdb/                            # NEW
      tmdb.client.ts
      tmdb.http.ts
      tmdb.schemas.ts
      tmdb.types.ts
    plex/                            # NEW
      plex.client.ts
      plex.schemas.ts
      plex.types.ts
    tautulli/                        # NEW
      tautulli.client.ts
      tautulli.schemas.ts
      tautulli.types.ts
    routing/                         # NEW
      library-router.ts
      library-router.types.ts
  conversation/
    engine.ts                        # MODIFIED: pass new clients + user role
    tool-loop.ts                     # MODIFIED: permission check injection
    tools.ts                         # MODIFIED: requiredRole on ToolDefinition
    types.ts                         # MODIFIED: extended ToolContext
    system-prompt.ts                 # MODIFIED: new capabilities description
    tools/
      index.ts                      # MODIFIED: export new tools
      search-movies.ts              # MODIFIED: TMDB enrichment + RCS cards
      search-series.ts              # MODIFIED: TMDB enrichment + RCS cards
      add-movie.ts                  # MODIFIED: library routing + tracking
      add-series.ts                 # MODIFIED: library routing + tracking
      remove-movie.ts               # MODIFIED: requiredRole = 'admin'
      remove-series.ts              # MODIFIED: requiredRole = 'admin'
      discover-movies.ts            # NEW: TMDB discover endpoint
      discover-series.ts            # NEW: TMDB discover endpoint
      check-plex-library.ts         # NEW: Plex library check
      get-watch-history.ts          # NEW: Tautulli watch history
  messaging/
    types.ts                         # MODIFIED: contentSid, contentVariables
    twilio-provider.ts               # MODIFIED: Content API support
  users/
    user.service.ts                  # unchanged (isAdmin already exists)
    user.types.ts                    # unchanged
    permissions.ts                   # NEW: permission helper functions
  plugins/
    tmdb.ts                          # NEW
    plex.ts                          # NEW
    tautulli.ts                      # NEW
    dashboard.ts                     # NEW
    conversation.ts                  # MODIFIED: register new tools + pass context
    webhook.ts                       # MODIFIED: pass isAdmin to context
  dashboard/
    routes.ts                        # NEW: admin API routes
    auth.ts                          # NEW: token validation
    stats.ts                         # NEW: stats queries
    types.ts                         # NEW: API types

dashboard/                           # NEW: SPA frontend (separate package)
  package.json
  vite.config.ts
  src/
    ...
```

## Suggested Build Order (Dependency Graph)

```
Phase 1: TMDB Client + Library Router
  (no dependencies on other new features)
  |- TMDB client (search, discover, details, genres)
  |- TMDB plugin (Fastify registration)
  |- Library router (anime detection, language detection)
  |- Modify add_movie/add_series to use routing
  |- New discover tools (discover_movies, discover_series)
  |- Update ToolContext with tmdb

Phase 2: Permissions + Media Tracking
  (depends on: Phase 1 for routing in add tools)
  |- Add requiredRole to ToolDefinition
  |- Permission check in tool-loop.ts
  |- media_tracking table + Drizzle migration
  |- Tracking inserts in add tool executors
  |- Admin notification on non-admin add
  |- Update defineTool() to accept requiredRole

Phase 3: Plex + Tautulli Integration
  (independent of Phases 1-2, but logically after)
  |- Plex client (library sections, search, metadata)
  |- Tautulli client (history, users, stats)
  |- Plex/Tautulli plugins
  |- check_plex_library tool
  |- get_watch_history tool
  |- Update ToolContext with plex, tautulli

Phase 4: Web Admin Dashboard
  (depends on: Phases 1-3 for full data to display)
  |- Dashboard API routes (users, messages, stats, media tracking)
  |- Dashboard auth middleware
  |- user_plex_links table + Drizzle migration
  |- Plex user linking API
  |- @fastify/static setup
  |- Dashboard SPA frontend (React + Vite + Tailwind)
  |- Docker multi-stage build update

Phase 5: RCS Rich Messaging
  (depends on: Phase 1 for TMDB poster URLs)
  |- Twilio Content Template creation
  |- Extended OutboundMessage with contentSid
  |- Modified TwilioMessagingProvider.send()
  |- Rich card sending in search result tools
  |- Suggested reply integration
  |- SMS fallback verification

Phase 6: System Prompt + Personality
  (depends on: all above for complete capability description)
  |- Updated system prompt with all new capabilities
  |- Fun/edgy personality tuning
  |- Edge case testing across all tools
```

### Build Order Rationale

1. **TMDB + Library Router first** because it has zero dependencies on other new features and unlocks the highest-value capability (structured discovery + smart routing). The library router is also a prerequisite for correct media organization.

2. **Permissions + Tracking second** because it modifies the tool execution path that Phase 1 already touched (add tools). Better to layer permissions and tracking onto the routing changes while they are fresh.

3. **Plex + Tautulli third** because they are read-only integrations (no writes to external systems) and can be developed independently. They provide the data needed for dashboard views.

4. **Dashboard fourth** because it consumes data from all previous phases (users, messages, media tracking, Plex links). Building it earlier would require mocking data sources.

5. **RCS fifth** because it is a presentation layer enhancement that depends on TMDB poster URLs (Phase 1) and can be tested independently. It also carries the most uncertainty (Twilio template approval workflow) and should not block core functionality.

6. **System prompt last** because it describes the complete set of capabilities and should be written once all features are finalized.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Fat Library Router with External Calls

**What people do:** Make the library router call TMDB directly to fetch metadata.
**Why it's wrong:** The router should be a pure function that receives metadata and returns a routing decision. Making it call external APIs introduces side effects, makes testing harder, and couples routing logic to API availability.
**Do instead:** Fetch TMDB metadata in the tool executor, then pass it to the router function.

### Anti-Pattern 2: Dashboard Auth via Cookies/Sessions

**What people do:** Implement session-based auth with cookies for the dashboard.
**Why it's wrong:** This is a single-admin tool accessed by one person. Session management adds complexity (expiry, refresh, CSRF) for no benefit. The admin already has the secret token.
**Do instead:** Stateless token auth. Dashboard stores token in localStorage. API validates on every request. Simple, secure enough for admin-only access behind a firewall.

### Anti-Pattern 3: Per-Tool Permission Logic

**What people do:** Add `if (!isAdmin) return error` inside each tool's execute function.
**Why it's wrong:** Duplicates permission logic across every tool. Easy to forget on new tools. Hard to change policy centrally.
**Do instead:** Check permissions in the tool loop before dispatching to the tool executor. The tool is unaware of permissions.

### Anti-Pattern 4: Mixing Dashboard Routes with Webhook Routes

**What people do:** Put dashboard API routes in the same plugin as the Twilio webhook.
**Why it's wrong:** Different auth mechanisms (Twilio signature vs dashboard token), different consumers (browser vs Twilio), different concerns.
**Do instead:** Separate Fastify plugin for dashboard with its own prefix (`/api/admin/`), its own auth preHandler, and no coupling to the messaging layer.

### Anti-Pattern 5: Creating TMDB Client as a Wrapper Library

**What people do:** Build a full TMDB client covering all 100+ endpoints "for completeness."
**Why it's wrong:** Only 8-10 endpoints are needed. A full wrapper is maintenance overhead.
**Do instead:** Build only the endpoints you use. The client is internal -- not a published library.

## Sources

- TMDB API v3 documentation: https://developer.themoviedb.org/reference/getting-started (HIGH confidence)
- TMDB rate limiting: https://developer.themoviedb.org/docs/rate-limiting (HIGH confidence)
- TMDB authentication: https://developer.themoviedb.org/docs/authentication-application (HIGH confidence)
- TMDB discover endpoint: https://developer.themoviedb.org/reference/discover-movie (HIGH confidence)
- Plex Media Server API: https://developer.plex.tv/pms/ (HIGH confidence)
- Plex API documentation: https://www.plexopedia.com/plex-media-server/api/ (MEDIUM confidence)
- Plex authentication tokens: https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/ (HIGH confidence)
- Tautulli API reference: https://docs.tautulli.com/extending-tautulli/api-reference (HIGH confidence)
- Tautulli API wiki: https://github.com/Tautulli/Tautulli/wiki/Tautulli-API-Reference (HIGH confidence)
- Twilio RCS documentation: https://www.twilio.com/docs/rcs (HIGH confidence)
- Twilio Content Template Builder: https://www.twilio.com/docs/content (HIGH confidence)
- Twilio Content API resources: https://www.twilio.com/docs/content/content-api-resources (HIGH confidence)
- Twilio send templates: https://www.twilio.com/docs/content/send-templates-created-with-the-content-template-builder (HIGH confidence)
- @fastify/static: https://github.com/fastify/fastify-static (HIGH confidence)
- Existing codebase analysis: Direct file reads of all 47 source files (HIGH confidence)

---
*Architecture research for: WadsMedia v2.0 -- Smart Discovery & Admin*
*Researched: 2026-02-14*

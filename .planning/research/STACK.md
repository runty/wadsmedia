# Stack Research

**Domain:** Media management gateway -- v2.0 feature additions (smart discovery, Plex/Tautulli integration, web admin dashboard, RCS rich messaging, role-based permissions, smart library routing, user media tracking)
**Researched:** 2026-02-14
**Confidence:** HIGH

## Existing Stack (DO NOT CHANGE)

Already validated and in production. Listed for context only.

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | 22+ | Runtime |
| TypeScript | ^5.9.3 | Language (strict, ESM, `verbatimModuleSyntax`) |
| Fastify | ^5.7.4 | HTTP framework |
| better-sqlite3 | ^12.6.2 | Database driver |
| Drizzle ORM | ^0.45.1 | Query builder / migrations |
| OpenAI SDK | ^6.22.0 | LLM integration (configurable baseURL) |
| Twilio SDK | ^5.12.1 | SMS/RCS messaging |
| Zod | ^4.3.6 | Validation |
| Biome | ^2.3.15 | Linting/formatting |
| Vitest | ^4.0.18 | Testing |

## Recommended Stack Additions

### TMDB Integration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **No library -- use native `fetch()`** | N/A | TMDB API v3 client | The existing codebase already has a `media/http.ts` module with `apiRequest()` that wraps `fetch()` with Zod validation, timeout handling, and structured error classification. TMDB's REST API is straightforward (bearer token auth, JSON responses, paginated results). Adding a library like `tmdb-ts` (v2.0.2) would introduce an unnecessary abstraction layer when the existing pattern works perfectly. Build a thin `TmdbClient` class following the same pattern as `SonarrClient`/`RadarrClient`. |

**TMDB API Details:**
- Auth: Bearer token via `Authorization: Bearer {access_token}` header
- Base URL: `https://api.themoviedb.org/3`
- Key endpoints: `/search/movie`, `/search/tv`, `/search/multi`, `/movie/{id}`, `/tv/{id}`, `/discover/movie`, `/discover/tv`
- Response: JSON with pagination (`page`, `results[]`, `total_pages`, `total_results`)
- Image URLs: Constructed from `poster_path` + base URL `https://image.tmdb.org/t/p/w500`
- Free API key available at developer.themoviedb.org
- Rate limit: ~40 requests/second (generous for this use case)

**Why NOT tmdb-ts:**
- Adds a dependency for what is essentially `fetch()` + JSON parsing
- The existing `apiRequest()` pattern with Zod schemas gives better type safety than any third-party wrapper
- `tmdb-ts` uses its own internal types; we want Zod schemas that integrate with the existing validation pipeline
- Zero-dependency approach matches the project's philosophy (the existing HTTP client is already zero-dependency)

### Plex Integration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **No library -- use native `fetch()`** | N/A | Plex Media Server API client | Same rationale as TMDB. The Plex API is a straightforward REST API with token-based auth. Build a `PlexClient` class following the `SonarrClient` pattern. The existing third-party libraries (`@ctrl/plex` v4.0.0 uses `ofetch` dependency, `node-plex-api` is 4+ years stale, `@lukehagar/plexjs` is over-engineered for our needs) all add unnecessary complexity. |

**Plex API Details:**
- Auth: `X-Plex-Token` query parameter or header
- Base URL: User-configured (e.g., `http://plex:32400`)
- Response: XML by default; add `Accept: application/json` header for JSON
- Key endpoints: `/library/sections` (list libraries), `/library/sections/{id}/all` (list content), `/library/recentlyAdded`, `/status/sessions` (active streams), `/search?query=`
- Required headers: `X-Plex-Token`, `Accept: application/json`, `X-Plex-Client-Identifier` (arbitrary unique string)
- No rate limiting for local server access

**Why NOT @ctrl/plex:**
- Introduces `ofetch` dependency (the project uses native `fetch()` everywhere)
- v4.0.0 is the latest but the library targets a broader API surface than we need
- We only need: list libraries, get recently added, search, get sessions -- roughly 5-6 endpoints
- Building a thin client with Zod schemas gives us exactly the types we need

### Tautulli Integration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **No library -- use native `fetch()`** | N/A | Tautulli monitoring API client | The only npm package (`tautulli-api` v1.0.2) was last updated 7 years ago, has no TypeScript types, and is effectively abandoned. The Tautulli API is a simple query-parameter-based REST API. Build a `TautulliClient` class. |

**Tautulli API Details:**
- Auth: `apikey` query parameter
- Base URL: `http://{host}:{port}/api/v2?apikey={key}&cmd={command}`
- Response: JSON wrapped in `{"response": {"data": ..., "result": "success"}}`
- Key endpoints (via `cmd` parameter):
  - `get_activity` -- current streaming sessions
  - `get_history` -- viewing history with filtering (user, date range, media type)
  - `get_libraries` -- list all media libraries
  - `get_users` -- list users with access
  - `get_user_watch_time_stats` -- viewing patterns per user
  - `get_home_stats` -- popular content, concurrent streams
  - `get_library_watch_time_stats` -- aggregate watch time per library
- All parameters passed as query string key-value pairs

### Web Search Fallback

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Brave Search API (direct `fetch()`)** | REST API | Web search fallback for media not in TMDB | Independent search index (30B+ pages), generous free tier ($5/month credit = ~1,000 searches), simple REST API with JSON response, no npm package needed. Privacy-respecting. Superior to DuckDuckGo (limited API capabilities) and cheaper than Google Custom Search. |

**Brave Search API Details:**
- Auth: `X-Subscription-Token` header
- Base URL: `https://api.search.brave.com/res/v1/web/search`
- Response: JSON with `web.results[]` containing `title`, `url`, `description`
- Free tier: $5/month credit (~1,000 web searches at $5/1,000 requests)
- Key params: `q` (query), `count` (results per page), `search_lang`
- No npm package needed -- simple GET request with query params

**Why NOT DuckDuckGo:**
- DuckDuckGo's API is extremely limited (instant answers only, not full web search)
- No structured search results for media discovery

**Why NOT SearXNG:**
- Requires self-hosting a separate service -- unnecessary infrastructure complexity
- WadsMedia is already Docker-deployed; adding another container for search is overkill when Brave has a free tier

### Web Admin Dashboard

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| @fastify/view | ^11.1.1 | Template rendering for Fastify | Official Fastify plugin. Integrates directly with the existing Fastify 5 app. Supports `reply.viewAsync()` for async template rendering. Heavy caching in production mode. |
| eta | ^4.5.1 | Template engine | Lightweight (2.5KB gzipped vs EJS 4.4KB), written in TypeScript, native ESM support, zero dependencies, faster than EJS. Works with `@fastify/view`. Uses `import.meta.dirname` (requires Node 20.11+, we target 22+). |
| @fastify/static | ^8.x | Serve static assets (CSS, JS, images) | Official Fastify plugin for serving static files. v8.x supports Fastify 5.x per compatibility matrix. Needed for dashboard CSS/JS assets. |
| htmx | 2.x (CDN/vendored) | Dynamic UI updates without SPA framework | ~14KB, no build step, server-rendered HTML partials. Perfect for admin dashboard that needs interactivity (user management, request approval, stats refresh) without a React/Vue/Angular build pipeline. Served from CDN or vendored static file. |
| Alpine.js | 3.x (CDN/vendored) | Client-side interactivity (dropdowns, modals, tabs) | ~8KB gzipped, no build step, complements htmx for client-side state (modals, dropdowns, form validation). Declarative via HTML attributes. |

**Dashboard Architecture:**
- Server-rendered HTML via Eta templates + `@fastify/view`
- Dynamic updates via htmx (AJAX-driven HTML partials from Fastify routes)
- Client-side polish via Alpine.js (dropdowns, modals, tab switching)
- No build step, no bundler, no node_modules frontend dependencies
- htmx + Alpine.js loaded from CDN `<script>` tags or vendored into static assets
- Authentication via `@fastify/cookie` + `@fastify/session` (see below)

**Eta + Fastify integration pattern:**

```typescript
import fastifyView from "@fastify/view";
import { Eta } from "eta";

const eta = new Eta();
server.register(fastifyView, {
  engine: { eta },
  templates: path.join(import.meta.dirname, "views"),
});

// In route handler:
return reply.viewAsync("dashboard.eta", { users, stats });
```

**Why NOT React/Vue/Next.js:**
- Requires a build step, bundler configuration, and frontend tooling
- Massively over-engineered for an admin dashboard with ~5-10 pages
- Would double the project complexity for minimal benefit
- The project is 3,134 LOC -- adding a SPA framework would likely double that

**Why NOT AdminJS:**
- Opinionated auto-generated admin UI -- doesn't match the custom dashboard needs (RCS message preview, conversation logs, media request workflow)
- Heavy dependency footprint

### Dashboard Authentication & Security

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| @fastify/cookie | ^11.x | Cookie parsing for session management | Official Fastify plugin. Required by `@fastify/session`. Lightweight. |
| @fastify/session | ^11.x | Server-side session management | Official Fastify plugin. Uses `@fastify/cookie` for session ID storage. Compatible with express-session stores. For SQLite-based apps, use the built-in better-sqlite3 to store sessions (write a simple store adapter). |
| @fastify/csrf-protection | ^7.x | CSRF protection for dashboard forms | Official Fastify plugin. Prevents cross-site request forgery on admin dashboard POST routes. |

**Session Store Strategy:** Do NOT use default in-memory store in production (leaks memory). Write a simple `SqliteSessionStore` class that implements `get(id)`, `set(id, session)`, `destroy(id)` using the existing better-sqlite3 connection. This keeps the dependency count at zero for session storage.

### RCS Rich Messaging

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **No new dependencies** | N/A | RCS rich cards, suggested replies, carousels | The existing Twilio SDK (^5.12.1) already supports RCS. Rich content is sent via `client.messages.create()` with `contentSid` and `contentVariables` parameters. Content templates are created via the Twilio Content API (`https://content.twilio.com/v1/Content`). No additional packages needed. |

**RCS Implementation Details:**
- Rich cards, carousels, and suggested replies are defined as **Content Templates** in Twilio
- Templates created programmatically via POST to `https://content.twilio.com/v1/Content` using basic auth (account SID + auth token)
- Template types: `twilio/card` (rich card), `twilio/carousel` (carousel), `twilio/quick-reply` (suggested replies)
- Sending uses existing SDK: `client.messages.create({ contentSid: "HXXX...", contentVariables: JSON.stringify({1: "value"}), messagingServiceSid: "MGXXX...", to: "+1..." })`
- `contentSid` replaces both `body` and `mediaUrl` parameters
- Automatic SMS fallback when RCS not available (via Messaging Service configuration)
- RCS-only sending: prefix `to` with `rcs:` (e.g., `rcs:+15551234567`)
- Image URLs in cards: use TMDB poster URLs directly (publicly accessible HTTPS required)

**MessagingProvider Interface Extension:**
The existing `OutboundMessage` type needs extension to support rich content:

```typescript
interface OutboundMessage {
  to: string;
  body: string;  // text-only messages
  messagingServiceSid?: string;
  from?: string;
  // NEW for RCS rich content:
  contentSid?: string;
  contentVariables?: Record<string, string>;
  mediaUrl?: string[];  // for inline media
}
```

The `TwilioMessagingProvider.send()` method conditionally includes `contentSid`/`contentVariables` when present, or falls back to `body` for plain text.

### Smart Library Routing

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **No new dependencies** | N/A | Route media to correct Sonarr/Radarr instance based on metadata | This is a logic layer, not a technology choice. Use TMDB metadata (genre, language, rating, year) plus Plex library structure to determine which quality profile, root folder, or instance to target. Implement as a `LibraryRouter` service class with configurable rules stored in SQLite via Drizzle. |

### Role-Based Permissions

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **No new dependencies** | N/A | User role management (admin, user, viewer) | The existing user system (`users/user.service.ts`, `users/user.types.ts`) with Drizzle + SQLite handles this. Add a `role` column to the users table. Implement permission checks as Fastify hooks/decorators. No RBAC library needed for 3-4 roles. |

### User Media Tracking

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **No new dependencies** | N/A | Track which users requested which media | New Drizzle schema tables (`media_requests`, `media_tracking`). Join user data with Sonarr/Radarr media IDs and Tautulli watch history. Pure database schema + query work. |

---

## Supporting Libraries Summary

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @fastify/view | ^11.1.1 | Template rendering | Dashboard phase |
| eta | ^4.5.1 | Template engine | Dashboard phase |
| @fastify/static | ^8.x | Static file serving | Dashboard phase |
| @fastify/cookie | ^11.x | Cookie support | Dashboard auth |
| @fastify/session | ^11.x | Session management | Dashboard auth |
| @fastify/csrf-protection | ^7.x | CSRF protection | Dashboard auth |

## Development Tools

No new development tools needed. Existing Biome, Vitest, tsx, and drizzle-kit cover all v2.0 needs.

---

## Installation

```bash
# Dashboard (all installed together when dashboard phase begins)
npm install @fastify/view @fastify/static @fastify/cookie @fastify/session @fastify/csrf-protection eta

# No other new npm dependencies -- all API integrations use native fetch()
```

**Total new production dependencies: 6** (all official Fastify plugins + Eta template engine)
**Total new API integrations via native fetch: 4** (TMDB, Plex, Tautulli, Brave Search)

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Native `fetch()` for TMDB | tmdb-ts v2.0.2 | If TMDB API surface grows beyond ~10 endpoints and maintaining Zod schemas becomes burdensome. Currently not needed -- we need search + details only. |
| Native `fetch()` for Plex | @ctrl/plex v4.0.0 | If Plex integration expands to media playback control, transcoding management, or account management. For read-only library queries, native fetch is simpler. |
| Native `fetch()` for Tautulli | tautulli-api v1.0.2 | Never. Package is abandoned (7 years stale), no TypeScript types, no ESM support. |
| Native `fetch()` for Brave Search | brave-search npm | Unnecessary wrapper around a simple GET request. Adds dependency for one HTTP call. |
| Eta template engine | EJS | If team is more familiar with EJS syntax. Eta is faster, lighter, and has first-class TypeScript/ESM support. |
| Eta template engine | Handlebars | If logic-less templates are preferred. Eta is more flexible (embedded JS) which suits an admin dashboard with conditional rendering and iteration. |
| htmx + Alpine.js | React + Vite | If the dashboard grows into a full application with complex client-side state (e.g., real-time collaborative editing). For an admin dashboard with ~10 pages, htmx is dramatically simpler. |
| Brave Search API | Google Custom Search | If search quality is critical and budget allows. Brave is sufficient for media discovery supplementation. |
| Brave Search API | Tavily | If AI-optimized search results are needed. More expensive but better for LLM consumption. Consider if Brave search quality proves insufficient. |
| @fastify/session | @fastify/secure-session | If stateless encrypted cookie sessions are preferred over server-side session storage. Secure-session stores all data in the cookie (encrypted), avoiding server-side storage. Good alternative if session data is small. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| tmdb-ts, moviedb-promise, or any TMDB wrapper | Adds dependency for what `fetch()` + Zod does better. The project already has a proven HTTP client pattern. These wrappers use their own type systems instead of Zod. | Build `TmdbClient` class using existing `media/http.ts` pattern |
| @ctrl/plex | Introduces `ofetch` dependency, inconsistent with project's native `fetch()` approach | Build `PlexClient` class using existing pattern |
| tautulli-api | Abandoned (last update ~2018), no TypeScript types, no ESM support | Build `TautulliClient` class using existing pattern |
| Express-based admin frameworks (AdminJS, etc.) | Wrong framework. Project uses Fastify. AdminJS has heavy deps and opinionated UI. | Eta + htmx + Alpine.js with @fastify/view |
| React, Vue, Angular, Svelte for dashboard | Requires build tooling, bundler, and frontend framework expertise. Doubles project complexity for an admin UI with ~10 pages. | Server-rendered Eta templates + htmx for dynamic updates |
| Passport.js for dashboard auth | Express-focused, over-engineered for simple admin auth. Project needs password auth for a handful of admin users, not OAuth/social login. | @fastify/session + simple password check |
| Socket.io for real-time dashboard | Heavy dependency for what htmx SSE/polling handles. Dashboard doesn't need bidirectional real-time communication. | htmx `hx-trigger="every 30s"` for polling, or htmx SSE extension |
| brave-search npm package | Unnecessary wrapper around a simple GET request. Adds dependency for one HTTP call. | Direct `fetch()` to Brave Search API |
| `axios` or `got` for API clients | Node 22 has native `fetch()`. The project already uses it exclusively. Adding an HTTP client library contradicts existing patterns. | Built-in `fetch()` via existing `media/http.ts` pattern |

---

## Stack Patterns by Variant

**If Plex integration grows to need real-time events (live session monitoring):**
- Consider `@lukehagar/plexjs` which has WebSocket support for real-time events
- Or use Tautulli's notification agents to POST to a WadsMedia webhook instead
- Verify ESM compatibility before adopting any Plex library

**If dashboard needs real-time streaming data (live transcoding stats, active sessions):**
- Use htmx SSE extension (`hx-ext="sse"`) with Fastify SSE routes
- No WebSocket library needed -- Fastify supports SSE natively via `reply.raw`

**If search quality from Brave proves insufficient:**
- Upgrade to Tavily ($0.01/search) for AI-optimized results
- Or add Google Custom Search as secondary fallback
- Keep the search interface abstract so providers can be swapped

**If session management needs scale (multiple WadsMedia instances):**
- Switch from SQLite session store to Redis via `connect-redis`
- But for single-instance Docker deployment, SQLite sessions are fine

**If Content Template management becomes complex:**
- Create a `ContentTemplateService` that caches template SIDs and manages lifecycle
- Templates rarely change -- seed them on app startup and cache the SIDs in memory

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| @fastify/view ^11.x | Fastify ^5.x | Official plugin, actively maintained |
| @fastify/static ^8.x | Fastify ^5.x | v8.x explicitly supports Fastify 5 per compatibility matrix |
| @fastify/cookie ^11.x | Fastify ^5.x | Official plugin |
| @fastify/session ^11.x | Fastify ^5.x, requires @fastify/cookie | Register cookie plugin before session plugin |
| @fastify/csrf-protection ^7.x | Fastify ^5.x, requires @fastify/cookie or @fastify/session | Register session plugin before CSRF plugin |
| eta ^4.5.1 | Node.js 20.11+ (for `import.meta.dirname`) | Project targets Node 22+, fully compatible |
| htmx 2.x | Any (CDN script, no npm) | No npm install -- loaded via `<script>` tag or vendored |
| Alpine.js 3.x | Any (CDN script, no npm) | No npm install -- loaded via `<script>` tag or vendored |

---

## Environment Variables (New for v2.0)

These extend the existing `config.ts` env schema:

```bash
# TMDB (required for smart discovery)
TMDB_ACCESS_TOKEN=       # v3 API read access token (bearer auth)

# Plex (optional, for library integration)
PLEX_URL=                # e.g., http://plex:32400
PLEX_TOKEN=              # X-Plex-Token value

# Tautulli (optional, for watch stats)
TAUTULLI_URL=            # e.g., http://tautulli:8181
TAUTULLI_API_KEY=        # Tautulli API key

# Brave Search (optional, for web search fallback)
BRAVE_SEARCH_API_KEY=    # Brave Search API subscription token

# Dashboard (required for web admin)
DASHBOARD_SECRET=        # Session encryption key (min 32 chars)
DASHBOARD_USERNAME=      # Admin login username
DASHBOARD_PASSWORD_HASH= # bcrypt hash of admin password
```

---

## Sources

- [TMDB API Getting Started](https://developer.themoviedb.org/reference/intro/getting-started) -- authentication, endpoints, response format (HIGH confidence)
- [tmdb-ts GitHub](https://github.com/blakejoy/tmdb-ts) -- evaluated and rejected, v2.0.2, zero deps, native fetch (HIGH confidence)
- [Plex Developer Portal](https://developer.plex.tv/) -- official API documentation (HIGH confidence)
- [Plexopedia API Reference](https://www.plexopedia.com/plex-media-server/api/) -- endpoint patterns, auth method (MEDIUM confidence)
- [Plex X-Plex-Token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/) -- token authentication details (HIGH confidence)
- [@ctrl/plex GitHub](https://github.com/scttcper/plex) -- evaluated and rejected, v4.0.0, uses ofetch (HIGH confidence)
- [@lukehagar/plexjs GitHub](https://github.com/LukasParke/plexjs) -- evaluated, TypeScript SDK with WebSocket support (MEDIUM confidence)
- [Tautulli API Reference](https://docs.tautulli.com/extending-tautulli/api-reference) -- endpoint catalog, auth, response format (HIGH confidence)
- [tautulli-api npm](https://www.npmjs.com/package/tautulli-api) -- evaluated and rejected, v1.0.2, 7 years stale (HIGH confidence)
- [Brave Search API](https://brave.com/search/api/) -- pricing, endpoints, free tier details (HIGH confidence)
- [Twilio RCS Documentation](https://www.twilio.com/docs/rcs) -- RCS capabilities overview (HIGH confidence)
- [Twilio Send RCS Messages](https://www.twilio.com/docs/rcs/send-an-rcs-message) -- ContentSid, rich cards, suggested replies, code examples (HIGH confidence)
- [Twilio Content Template Builder](https://www.twilio.com/docs/content) -- template types, API structure (HIGH confidence)
- [Twilio Content API Quickstart](https://www.twilio.com/docs/content/create-and-send-your-first-content-api-template) -- programmatic template creation (HIGH confidence)
- [Twilio Getting Started with RCS + Node.js](https://www.twilio.com/en-us/blog/developers/tutorials/product/getting-started-with-rcs-node) -- Node.js implementation pattern (HIGH confidence)
- [@fastify/view GitHub (point-of-view)](https://github.com/fastify/point-of-view) -- v11.x, template engine support, Fastify compatibility (HIGH confidence)
- [@fastify/static GitHub](https://github.com/fastify/fastify-static) -- v8.x supports Fastify 5.x per compatibility matrix (HIGH confidence)
- [Eta Template Engine](https://eta.js.org/) -- v4.5.1, TypeScript, ESM, lightweight (HIGH confidence)
- [Eta + Fastify Integration Guide](https://eta.js.org/docs/4.x.x/resources/fastify) -- setup pattern with @fastify/view (HIGH confidence)
- [htmx + Alpine.js Combination](https://www.infoworld.com/article/3856520/htmx-and-alpine-js-how-to-combine-two-great-lean-front-ends.html) -- architecture rationale (MEDIUM confidence)
- [@fastify/session GitHub](https://github.com/fastify/session) -- session store interface, TypeScript support (HIGH confidence)

---
*Stack research for: WadsMedia v2.0 feature additions*
*Researched: 2026-02-14*

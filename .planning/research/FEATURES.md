# Feature Research: v2.0 Smart Discovery & Admin

**Domain:** Conversational media server management -- TMDB discovery, Plex/Tautulli integration, admin dashboard, RCS rich messaging, permissions, routing, tracking
**Researched:** 2026-02-14
**Confidence:** MEDIUM-HIGH (verified against official API docs for TMDB, Plex, Tautulli, Twilio Content API; codebase examined directly)

**Scope:** This research covers ONLY the v2.0 features. v1.0 features (search, add, remove, status, upcoming, notifications, multi-user, conversation history) are already shipped and working.

---

## Feature Landscape

### Table Stakes (Users Expect These)

For a media management assistant that claims Plex/TMDB integration, these are what users will assume exist from day one.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Plex library existence check | Overseerr, Jellyseerr, and every request app checks "do you already have this?" against Plex. Without this, users add duplicates. | MEDIUM | Plex API: `GET /library/sections/{id}/all?includeGuids=1` returns TMDB/TVDB IDs. Build a local cache of GUIDs at startup, refresh on schedule. Must handle multiple library sections (Movies, TV, Anime, etc). |
| Role-based permissions (admin vs regular) | Overseerr, Requestrr, and Searcharr all distinguish admin from regular users. Non-admins should not delete media. | LOW | DB schema already has `isAdmin` boolean on users table. Extend ToolContext to pass user role. Check tier in tool-loop before executing destructive tools. Existing confirmation system provides the pattern. |
| Per-user media request tracking | Overseerr tracks who requested what. Admin needs to know "who added 47 anime shows last month?" for accountability. | LOW | New `media_requests` table: userId, mediaType, title, tmdbId/tvdbId, requestedAt. Insert on every successful add_movie/add_series call. |
| Admin notification on user requests | Standard in Overseerr (email/Discord when user requests). Admin wants to know immediately when someone adds media. | LOW | After successful add, send SMS to ADMIN_PHONE with requester name + title. Template-based (not LLM), same pattern as download-complete notifications. |
| TMDB genre/actor/network discovery | TMDB discover endpoint is the industry standard. Users expect "show me sci-fi movies" or "what has Oscar Isaac been in?" from any media discovery tool. | MEDIUM | TMDB API: `/3/discover/movie` and `/3/discover/tv` with `with_genres`, `with_cast`, `with_networks`, `with_keywords`. Requires resolving genre names to IDs and person names to person IDs first. |
| TV show season/episode availability in Plex | When checking Plex, "you have seasons 1-3" is expected. Partial availability is the norm for TV. | MEDIUM | Plex API: `GET /library/metadata/{ratingKey}/children` for seasons, then `/children` on each season for episodes. Pagination required (X-Plex-Container-Size). Cache show-level availability. |
| Smart library routing (anime) | Sonarr supports `seriesType: "anime"` and multiple root folders. Users with separate anime libraries expect correct routing. | LOW | Sonarr search results include `genres` array (contains "Animation"/"Anime") and `seriesType` field. Map anime-typed series to configured anime root folder path. Env vars: `SONARR_ANIME_ROOT_FOLDER`. |
| Smart library routing (Asian-language movies) | Users with CMovies/Asian cinema libraries expect correct folder placement. Radarr supports multiple root folders. | LOW | Radarr lookup response includes `originalLanguage: { id, name }`. Check against known Asian language codes (ja, ko, zh, th, hi, ta, te, vi, ms, tl). Map to `RADARR_CMOVIES_ROOT_FOLDER` env var. |

### Differentiators (Competitive Advantage)

Features that set WadsMedia apart from Overseerr, Requestrr, and other request managers. These leverage the LLM + conversational interface.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| TMDB-powered natural language discovery | "Show me action movies from the 90s" or "what comedies has Melissa McCarthy been in?" -- no competitor handles this via natural language. Overseerr has a basic trending/discover page but it is click-based, not conversational. | HIGH | New LLM tool: `discover_media` that maps natural language to TMDB discover API params. LLM extracts genre, actor, year range, network from conversation. Requires genre ID lookup table and person search (`/3/search/person`). |
| Web search fallback for vague queries | "That movie where the guy is stuck in a time loop" cannot be answered by TMDB structured search. An LLM with web search can figure it out (Groundhog Day, Palm Springs, etc). No competitor does this. | MEDIUM | New LLM tool: `web_search` backed by a search API (Tavily, SerpAPI, or similar). LLM decides when structured TMDB search fails and falls back to web search. Return TMDB-matchable titles. |
| Tautulli watch history awareness | "What have I been watching?" or "recommend something like what I watched last week." No chatbot competitor integrates watch history. Overseerr does not use Tautulli at all. | MEDIUM | Tautulli API: `get_history` with `user_id` filter. Requires Plex user linking (map WadsMedia user to Plex/Tautulli user_id). New LLM tool: `get_watch_history`. Can power recommendations based on recent viewing. |
| RCS rich cards with posters and buttons | Search results displayed as visual cards with poster images and "Add this" / "Next result" suggested reply buttons. No SMS-based competitor has this. Telegram/Discord bots do have inline keyboards, but not SMS. | HIGH | Twilio Content API: create `twilio/card` templates programmatically. Cards support title, body, media URL, and QUICK_REPLY actions. Media URL supports variables for dynamic poster images. TMDB poster URL: `https://image.tmdb.org/t/p/w500/{poster_path}`. SMS fallback is automatic via Messaging Service. |
| RCS suggested reply buttons | Quick-tap buttons for common follow-up actions ("Add this", "More results", "Check Plex"). Reduces typing friction on mobile. | MEDIUM | Twilio Content API `twilio/quick-reply` type with up to 3 buttons per message. Or use card actions with `type: "QUICK_REPLY"`. Titles limited to 20 characters. Must handle graceful SMS fallback (buttons become text suggestions). |
| Web admin dashboard | Visual management for admins: user list, chat history viewer, request stats, Plex user linking. Overseerr has a full web UI but it replaces the messaging flow; WadsMedia's dashboard is admin-only and complements messaging. | HIGH | New Fastify route prefix `/admin`. Serve React/Preact SPA via `@fastify/static`. API endpoints for: users CRUD, chat history read, request stats aggregation, Plex user linking. Simple auth (bearer token or basic auth -- not OAuth per PROJECT.md out-of-scope). |
| Plex user linking | Connect a WadsMedia phone user to their Plex account, enabling personalized Plex library checks and Tautulli history per user. No chatbot competitor does this. | MEDIUM | Admin dashboard UI: dropdown of Plex shared users (from Tautulli `get_users` or Plex API) mapped to WadsMedia user records. New DB column: `users.plexUserId` or `users.plexUsername`. Used by Plex library checks and Tautulli history queries. |
| Contextual Plex-aware responses | "Do I have Breaking Bad?" checks the user's linked Plex library. "You have seasons 1-4, missing season 5." LLM integrates Plex data into natural conversation. | MEDIUM | New LLM tool: `check_plex_library`. Returns structured availability (movie: exists/missing; show: per-season episode counts). LLM formats into conversational response. Requires Plex user linking for per-user checks. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Plex playback control | "Play Breaking Bad on my TV" after discovering it exists in Plex | Completely different domain. Plex has no reliable remote playback API across devices. Each client (Roku, Apple TV, web, mobile) has different capabilities. Massive scope, unreliable results. | Report availability: "Breaking Bad is ready on your Plex server." Let the user open Plex themselves. |
| Full request approval workflow | Overseerr has approve/deny. "I want to review requests before they download." | Adds enormous state machine complexity (pending/approved/denied/available). Contradicts the instant-gratification messaging UX. If a user texts "add Breaking Bad" and gets "your request has been submitted for review," the conversational magic dies. | Whitelist IS the trust boundary. If someone is whitelisted, their adds go through. Admin gets a notification. If abuse happens, remove from whitelist. |
| Per-user Plex library views | "Show me what's in MY Plex library" (full browsing) | Plex libraries can have thousands of items. Presenting a browseable library over SMS is absurd. Even RCS cannot handle this gracefully. | Support targeted queries: "Do I have X?" or "How many episodes of Y do I have?" -- not "show me everything." |
| TMDB account integration | "Sync my TMDB watchlist" or "Rate movies" | TMDB accounts add OAuth complexity, user management overhead, and serve a niche use case. Most users do not have TMDB accounts. | TMDB is a data source, not a user-facing account. Use TMDB API with app-level API key for discovery. |
| Multiple Sonarr/Radarr instance routing | "Route 4K requests to my 4K Radarr, regular to standard" | Doubles API surface, adds quality-preference state per user, complicates every search/add flow. Very niche power-user need. | Single Sonarr + single Radarr instance. Users who need 4K routing should use Overseerr or TRaSH Guides quality profiles. Architecture does not prevent adding this later. |
| Real-time Plex activity monitoring | "Who's watching on my server right now?" | Plex sessions API exists, but this is a monitoring tool feature (Tautulli dashboard), not a media management feature. Exposes privacy concerns (users tracking other users). | Tautulli integration focuses on history (past), not sessions (present). Admin can check Tautulli dashboard directly for live activity. |
| Automated Plex library sync/refresh | "Automatically refresh Plex when a download completes" | Sonarr/Radarr already trigger Plex library updates via their own Plex notification connection settings. Building this redundantly adds complexity. | Document that users should configure Sonarr/Radarr's built-in Plex notification connection. Not WadsMedia's responsibility. |
| Complex dashboard analytics | Grafana-style charts, trend analysis, per-show download stats | Admin dashboard should be simple and focused. Complex analytics is a separate tool's job (Tautulli already does this beautifully). | Dashboard shows: total requests per user, recent requests list, active users, system health. Link to Tautulli for deep analytics. |

---

## Detailed Feature Analysis

### 1. TMDB-Powered Smart Discovery

**What it is:** A new LLM tool that lets users discover media by genre, actor, director, network, year, keyword, or combinations thereof. Goes beyond title search.

**How it works:**
1. User says "show me sci-fi movies from the 2020s" or "what shows has Pedro Pascal been in?"
2. LLM extracts structured parameters: genre="Science Fiction", year_gte=2020, year_lte=2029
3. Tool resolves genre name to TMDB genre ID (878 for Sci-Fi movies, 10765 for Sci-Fi & Fantasy TV)
4. Tool calls TMDB discover endpoint with structured params
5. Results returned to LLM for natural presentation

**TMDB API endpoints needed:**
- `GET /3/genre/movie/list` -- genre name-to-ID mapping (cache at startup)
- `GET /3/genre/tv/list` -- TV genre mapping (cache at startup)
- `GET /3/search/person?query={name}` -- resolve actor/director name to person ID
- `GET /3/discover/movie` -- structured discovery with filters
- `GET /3/discover/tv` -- structured discovery with filters
- `GET /3/search/multi?query={term}` -- fallback for simple title searches

**Key TMDB discover parameters:**
- `with_genres` -- comma-separated genre IDs (AND), pipe-separated (OR)
- `with_cast` -- person IDs for cast members
- `with_crew` -- person IDs for crew (directors)
- `with_networks` -- network IDs (TV only)
- `with_keywords` -- keyword IDs
- `primary_release_date.gte` / `.lte` -- year range (movies)
- `first_air_date.gte` / `.lte` -- year range (TV)
- `with_original_language` -- ISO 639-1 language code
- `sort_by` -- popularity.desc, vote_average.desc, etc.
- `vote_count.gte` -- minimum votes (filter out obscure titles)

**TMDB genre IDs (hardcode -- these are stable):**
- Movie: Action(28), Comedy(35), Drama(18), Horror(27), Sci-Fi(878), Thriller(53), Romance(10749), Animation(16), Documentary(99), Fantasy(14), Crime(80), Mystery(9648)
- TV: Action&Adventure(10759), Comedy(35), Drama(18), Sci-Fi&Fantasy(10765), Crime(80), Documentary(99), Animation(16), Mystery(9648), Reality(10764), Kids(10762)

**Poster images:** `https://image.tmdb.org/t/p/w500/{poster_path}` -- publicly accessible, no auth needed.

**Complexity:** MEDIUM -- the TMDB API is well-documented and straightforward. The complexity is in the LLM tool design: the tool needs enough parameters to be flexible but not so many that the LLM struggles to fill them correctly.

**Confidence:** HIGH -- TMDB API endpoints verified via official docs.

### 2. Web Search Fallback

**What it is:** When TMDB structured search cannot answer a vague query ("that movie where the astronaut grows potatoes on Mars"), fall back to web search to identify the title, then look it up via TMDB/Sonarr/Radarr.

**How it works:**
1. LLM attempts TMDB search/discover
2. Results are poor or user's query is too vague for structured search
3. LLM calls `web_search` tool with the user's description
4. Web search returns candidate titles
5. LLM picks the best match and searches via TMDB/Sonarr/Radarr

**Implementation:** New LLM tool backed by a search API. Candidates: Tavily API (designed for LLM tool use), SerpAPI, or Brave Search API. Keep it simple -- just return top 5 text results.

**Complexity:** LOW-MEDIUM -- the web search API integration is simple. The art is in the LLM knowing when to use it vs structured search.

**Confidence:** MEDIUM -- depends on which search API is chosen. Tavily is purpose-built for AI agents but is a paid service.

### 3. Plex Library Integration

**What it is:** Check if media already exists in the user's Plex library, including per-season/episode availability for TV shows.

**How it works:**
1. Build a GUID-indexed cache of Plex library contents at startup
2. When user asks about a title or before adding, check cache for TMDB/TVDB ID match
3. For TV shows, drill into seasons/episodes for availability detail
4. Report "You have this" / "You have seasons 1-3, missing 4-5" / "Not in your library"

**Plex API endpoints needed:**
- `GET /library/sections` -- list all libraries (Movies, TV Shows, Anime, etc.)
- `GET /library/sections/{id}/all?includeGuids=1` -- all items with external IDs
- `GET /library/metadata/{ratingKey}/children` -- seasons for a show
- `GET /library/metadata/{seasonRatingKey}/children` -- episodes for a season
- `GET /hubs/search?query={title}` -- search by title

**Authentication:** `X-Plex-Token` header on all requests. Token obtained from Plex account settings. Single env var: `PLEX_URL` + `PLEX_TOKEN`.

**Caching strategy:** Full library scan at startup (items + GUIDs), refresh every 15-30 minutes via timer. Store in memory as `Map<string, PlexMediaItem>` keyed by `tmdb://{id}` or `tvdb://{id}`. For a 5000-item library, this is negligible memory.

**Per-user considerations:** If Plex user linking is configured, can check per-user library access. Without linking, check against the server owner's full library.

**Complexity:** MEDIUM -- the Plex API is straightforward but underdocumented. Pagination for seasons/episodes adds complexity. GUID format parsing (`com.plexapp.agents.imdb://tt0103639` vs `tmdb://12345`) requires handling both legacy and new agent formats.

**Confidence:** MEDIUM-HIGH -- Plex API endpoints verified via Plexopedia and official docs. GUID format details need runtime verification.

### 4. Tautulli Watch History Integration

**What it is:** Query what a user has been watching recently via Tautulli, enabling watch-history-aware recommendations.

**How it works:**
1. Admin links WadsMedia user to Plex user via dashboard
2. LLM tool `get_watch_history` queries Tautulli for that user's recent plays
3. Results inform recommendations: "Based on your recent watches, you might like..."

**Tautulli API endpoints needed:**
- `get_users` -- list Plex users with user_id, username, friendly_name
- `get_history` -- play history with filters (user_id, media_type, length, start, etc.)
- `get_user_watch_time_stats` -- aggregate stats (total plays, watch time by period)

**Authentication:** API key as query parameter: `?apikey={key}&cmd={command}`

**Env vars:** `TAUTULLI_URL`, `TAUTULLI_API_KEY`

**Complexity:** LOW-MEDIUM -- Tautulli API is simple and well-documented. The complexity is in the Plex user linking prerequisite.

**Confidence:** HIGH -- Tautulli API verified via official docs and GitHub wiki.

### 5. Web Admin Dashboard

**What it is:** A web interface for the admin to manage users, view chat histories, see request stats, and link Plex users.

**Expected pages/features:**
- **User Management:** List users, edit display name, toggle admin status, activate/deactivate, link Plex user
- **Chat History Viewer:** Read-only view of conversation history per user. Searchable. Shows tool calls and responses.
- **Request Log:** Table of all media requests with user, title, type, date. Filterable by user/date/type.
- **Dashboard Stats:** Total requests (7d/30d/all), active users, requests per user, most-requested genres, system health (Sonarr/Radarr/Plex/Tautulli connectivity)
- **Plex User Linking:** Dropdown of Plex users (from Tautulli/Plex API) mapped to WadsMedia users

**Architecture:**
- Backend: New Fastify route prefix `/api/admin/*` with bearer token auth
- Frontend: Lightweight SPA served via `@fastify/static`. Preact or React with minimal dependencies.
- Auth: Simple bearer token from env var `ADMIN_API_TOKEN`, or basic auth derived from `ADMIN_PHONE` + a password env var. NOT OAuth (out of scope per PROJECT.md).
- Build: Vite for frontend build, output to `/dist/admin` served by Fastify

**Complexity:** HIGH -- this is a full web application. Backend API, frontend SPA, authentication, multiple pages. Largest single feature in v2.0.

**Confidence:** HIGH for architecture patterns (Fastify + static SPA is well-documented). MEDIUM for effort estimation.

### 6. RCS Rich Cards

**What it is:** Search results displayed as visual rich cards with poster images and interactive buttons, on devices that support RCS.

**How it works:**
1. Create reusable Content Templates via Twilio Content API (`POST https://content.twilio.com/v1/Content`)
2. Templates use variables for dynamic content: `{{1}}` for title, `{{2}}` for description, `{{3}}` for poster URL
3. Send via standard `messages.create()` with `contentSid` instead of `body`
4. For non-RCS devices, Twilio automatically falls back to SMS (text-only)

**Template structure for search result card:**
```json
{
  "friendly_name": "media_search_result",
  "language": "en",
  "variables": {"1": "Movie Title", "2": "Description", "3": "poster.jpg"},
  "types": {
    "twilio/card": {
      "title": "{{1}}",
      "body": "{{2}}",
      "media": ["https://image.tmdb.org/t/p/w500/{{3}}"],
      "actions": [
        {"type": "QUICK_REPLY", "title": "Add this", "id": "add"},
        {"type": "QUICK_REPLY", "title": "More info", "id": "info"},
        {"type": "QUICK_REPLY", "title": "Skip", "id": "skip"}
      ]
    }
  }
}
```

**Key constraints:**
- Card title: max 200 characters (RCS)
- Card body: max 1,600 characters
- Quick reply title: max 20 characters
- Max 4 buttons before overflow to chip list
- Media URL must be publicly accessible (TMDB poster URLs are public)
- Variables: max 100 per template, values max 1,600 characters
- Messaging Service required for SMS/RCS fallback (add RCS sender to sender pool)

**Messaging provider changes:** The current `MessagingProvider` interface only supports `body: string`. Must extend to support `contentSid` + `contentVariables` for rich messages. Graceful fallback: if RCS unavailable or provider does not support rich content, fall back to text body.

**Complexity:** HIGH -- requires Content API integration, provider interface changes, template management, fallback handling, and changes to how the conversation engine formats responses.

**Confidence:** HIGH -- Twilio Content API and RCS card structure verified via official docs.

### 7. RCS Suggested Reply Buttons

**What it is:** Quick-tap buttons that appear below messages for common actions, reducing typing friction.

**Use cases:**
- After search: "Add this" / "More results" / "Check Plex"
- After add: "Add another" / "Check status"
- During disambiguation: numbered options as buttons
- Confirmation: "Yes" / "No" buttons for destructive actions

**Implementation:** Can be part of card templates (card actions) or standalone via `twilio/quick-reply` content type. Quick replies send the button text back as a regular inbound message, so the existing conversation flow handles them naturally.

**Complexity:** MEDIUM -- builds on the RCS card infrastructure. The LLM needs to know when to suggest specific quick replies, and the response formatting must handle both rich and plain text paths.

**Confidence:** HIGH -- verified via Twilio docs.

### 8. Role-Based Permissions

**What it is:** Admin users can do everything (search, add, remove, view all users' activity). Regular users can search and add but cannot remove media.

**Implementation:**
- DB already has `users.isAdmin` boolean
- Extend `ToolContext` to include `userRole: "admin" | "user"`
- Tools classified as `destructive` (remove_series, remove_movie) restricted to admin only
- Non-admin attempting destructive action gets friendly denial: "Only admins can remove media. Ask [admin name] if you need something removed."
- System prompt updated per role to describe available capabilities

**Complexity:** LOW -- most infrastructure exists. Just permission checks in tool-loop before execution.

**Confidence:** HIGH -- straightforward extension of existing patterns.

### 9. Smart Library Routing (Anime Detection)

**What it is:** When adding a series via Sonarr, auto-detect anime and route to the anime root folder + set seriesType to "anime."

**Detection logic:**
1. Check Sonarr lookup response `genres` array for "Animation" or "Anime"
2. Check if series originates from Japanese network (network field)
3. Check TMDB `original_language` if available (ja = Japanese)
4. If 2+ signals match, classify as anime

**Routing:**
- Anime: use `SONARR_ANIME_ROOT_FOLDER` env var, set `seriesType: "anime"`
- Non-anime: use default first root folder, set `seriesType: "standard"` (current behavior)

**Existing code impact:** `add-series.ts` currently uses `context.sonarr.rootFolders[0]`. Change to a routing function that picks root folder + seriesType based on metadata.

**Complexity:** LOW -- Sonarr already supports `seriesType` in AddSeriesInput and `genres` in lookup results. Just conditional logic.

**Confidence:** HIGH -- Sonarr API fields verified in existing codebase schema.

### 10. Smart Library Routing (Asian-Language Movies)

**What it is:** When adding a movie via Radarr, auto-detect Asian-language films and route to a separate root folder (e.g., CMovies).

**Detection logic:**
1. Check Radarr lookup response `originalLanguage.name` field
2. Match against Asian language set: Japanese, Korean, Chinese, Mandarin, Cantonese, Thai, Hindi, Tamil, Telugu, Vietnamese, Malay, Tagalog
3. Also check ISO 639-1 codes: ja, ko, zh, th, hi, ta, te, vi, ms, tl

**Routing:**
- Asian-language: use `RADARR_CMOVIES_ROOT_FOLDER` env var
- Other: use default first root folder (current behavior)

**Existing code impact:** `add-movie.ts` currently uses `context.radarr.rootFolders[0]`. Need to parse `originalLanguage` from Radarr lookup response (currently `.passthrough()` on schema, so the data is there but not typed). Add `originalLanguage` to `MovieLookupSchema`.

**Note:** Radarr lookup response confirmed to include `originalLanguage: { id: number, name: string }` but it is not currently in the Zod schema (the `.passthrough()` preserves it at runtime but it is untyped).

**Complexity:** LOW -- straightforward conditional logic + schema update.

**Confidence:** HIGH -- Radarr API field verified via GitHub issues and existing `.passthrough()` behavior.

### 11. Admin Notification on User Requests

**What it is:** When a non-admin user successfully adds media, send an SMS notification to the admin phone number.

**Expected behavior:**
- User adds "Breaking Bad" -> admin gets: "[User Name] just added Breaking Bad (2008) via Sonarr"
- Template-based, not LLM (instant, predictable, cheap)
- Only for non-admin users (admin does not need self-notification)
- Fire-and-forget (do not block the user's response)

**Implementation:** After successful add_movie or add_series tool execution, check if user is non-admin. If so, send notification to ADMIN_PHONE using existing messaging provider. Same pattern as download-complete notifications.

**Complexity:** LOW -- reuses existing notification infrastructure.

**Confidence:** HIGH.

### 12. Per-User Media Request Tracking

**What it is:** Record every media add with the requesting user, enabling accountability and stats.

**Schema:**
```sql
CREATE TABLE media_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  media_type TEXT NOT NULL, -- 'movie' | 'series'
  title TEXT NOT NULL,
  year INTEGER,
  external_id TEXT NOT NULL, -- 'tmdb:12345' or 'tvdb:67890'
  sonarr_radarr_id INTEGER, -- ID in Sonarr/Radarr after add
  status TEXT NOT NULL DEFAULT 'added', -- 'added' | 'available' | 'removed'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**Usage:**
- Insert on every successful add
- Update status to 'available' when download-complete notification fires
- Query for dashboard stats: requests per user, recent activity, most-requested
- LLM tool `get_my_requests` for users to see their own request history

**Complexity:** LOW -- standard CRUD on a new table.

**Confidence:** HIGH.

### 13. Plex User Linking

**What it is:** Associate a WadsMedia user (identified by phone number) with a Plex user account, enabling per-user library checks and watch history.

**Implementation:**
- New column: `users.plexUserId TEXT` (Tautulli user_id / Plex account ID)
- New column: `users.plexUsername TEXT` (display reference)
- Admin dashboard: shows WadsMedia users alongside Plex user dropdown (populated from Tautulli `get_users` or Plex API `GET /api/servers/{id}/shared_servers`)
- Admin selects which Plex user corresponds to which WadsMedia user
- Used by: Plex library checks (per-user library access), Tautulli history (per-user watch history)

**Complexity:** MEDIUM -- requires Tautulli/Plex user enumeration API call, admin UI for linking, and downstream consumers (Plex client, Tautulli client) to use the linked ID.

**Confidence:** MEDIUM-HIGH -- Tautulli `get_users` verified to return user_id, username, friendly_name.

---

## Feature Dependencies

```
[TMDB Client]
    |
    +--requires--> [TMDB API Key env var]
    |
    +--enables--> [TMDB Discovery Tool]
    |                 |
    |                 +--enables--> [RCS Rich Cards with Posters]
    |
    +--enables--> [Genre/Actor/Network search]

[Plex Client]
    |
    +--requires--> [PLEX_URL + PLEX_TOKEN env vars]
    |
    +--enables--> [Plex Library Check Tool]
    |                 |
    |                 +--enhances--> [Search tools] (show "in Plex" status)
    |                 |
    |                 +--requires(optional)--> [Plex User Linking] (for per-user checks)
    |
    +--enables--> [Season/Episode Availability]

[Tautulli Client]
    |
    +--requires--> [TAUTULLI_URL + TAUTULLI_API_KEY env vars]
    |
    +--requires--> [Plex User Linking] (must know which Plex user = which phone user)
    |
    +--enables--> [Watch History Tool]

[Plex User Linking]
    |
    +--requires--> [Web Admin Dashboard] (UI for linking)
    |
    +--requires--> [Tautulli Client OR Plex Client] (to enumerate Plex users)
    |
    +--enhances--> [Plex Library Check] (per-user)
    +--enhances--> [Tautulli Watch History] (per-user)

[Role-Based Permissions]
    |
    +--requires--> [users.isAdmin column] (ALREADY EXISTS)
    |
    +--enables--> [Admin Notification on Requests]
    +--enables--> [Restricted tool access]

[Per-User Request Tracking]
    |
    +--requires--> [New media_requests table]
    |
    +--enables--> [Admin Dashboard Stats]
    +--enables--> [User's own request history tool]

[Admin Notification]
    |
    +--requires--> [Role-Based Permissions] (know who is admin)
    +--requires--> [Per-User Request Tracking] (know what was added)
    +--uses--> [Existing Messaging Provider] (send SMS)

[Web Admin Dashboard]
    |
    +--requires--> [Admin API endpoints]
    +--requires--> [Frontend SPA build pipeline]
    +--requires--> [Dashboard auth mechanism]
    |
    +--consumes--> [Per-User Request Tracking] (request log/stats)
    +--consumes--> [Chat History] (ALREADY EXISTS in messages table)
    +--enables--> [Plex User Linking UI]

[RCS Rich Cards]
    |
    +--requires--> [Twilio Content API integration]
    +--requires--> [MessagingProvider interface extension]
    +--requires--> [TMDB poster URLs] (from TMDB Client)
    |
    +--enhances--> [Search results presentation]
    +--enhances--> [Discovery results presentation]

[RCS Suggested Replies]
    |
    +--requires--> [RCS Rich Cards infrastructure] (Content API)
    |
    +--enhances--> [Disambiguation flow]
    +--enhances--> [Confirmation flow]

[Smart Routing (Anime)]
    |
    +--requires--> [SONARR_ANIME_ROOT_FOLDER env var]
    +--uses--> [Sonarr lookup genres] (ALREADY EXISTS in schema)

[Smart Routing (Asian Movies)]
    |
    +--requires--> [RADARR_CMOVIES_ROOT_FOLDER env var]
    +--requires--> [originalLanguage field in Radarr schema] (needs schema update)

[Web Search Fallback]
    |
    +--requires--> [Search API key/integration] (Tavily, SerpAPI, etc.)
    +--enhances--> [TMDB Discovery] (catches what structured search misses)
```

### Dependency Notes

- **Tautulli requires Plex User Linking:** Without knowing which Plex user a phone number corresponds to, Tautulli history queries cannot be scoped to the right user. Plex User Linking must be built first.
- **Plex User Linking requires Admin Dashboard:** The linking UI lives in the admin dashboard. No point building linking without the dashboard to configure it.
- **RCS Suggested Replies require RCS Rich Cards:** Both use the Twilio Content API infrastructure. Build cards first, then add suggested replies.
- **Admin Notification requires Permissions + Tracking:** Must know who is admin (to send notification) and what was added (to compose notification).
- **Smart Routing is independent:** Anime and Asian-language routing has no dependencies on other v2.0 features. Can be built at any time. Low complexity, high value.
- **TMDB Client is foundational:** Discovery, rich cards (poster URLs), and enhanced search all depend on TMDB integration. Build early.
- **Web Admin Dashboard is the largest scope:** Depends on request tracking and provides the UI for Plex linking. Should be built after API/backend features are stable.

---

## Build Phase Recommendations

### Phase 1: Foundation (Low-hanging fruit, no external API dependencies beyond existing)
- Role-based permissions
- Per-user media request tracking
- Admin notification on user requests
- Smart library routing (anime + Asian-language movies)

**Rationale:** All LOW complexity. All use existing infrastructure. Immediate value for admin visibility and library organization. No new external services needed.

### Phase 2: TMDB Discovery
- TMDB API client
- TMDB discovery LLM tool (genre, actor, network, year search)
- Web search fallback tool
- Enhanced search results with TMDB metadata (posters, ratings)

**Rationale:** TMDB client is prerequisite for RCS rich cards (poster URLs) and the core new user-facing feature. Web search fallback extends discovery naturally.

### Phase 3: Plex/Tautulli Integration
- Plex API client with library caching
- Plex library check LLM tool
- Season/episode availability checking
- Tautulli API client
- Tautulli watch history LLM tool

**Rationale:** Depends on nothing from Phase 2 but is higher complexity than Phase 1. Can run in parallel with Phase 2 if desired. Plex user linking deferred to dashboard phase.

### Phase 4: Web Admin Dashboard
- Backend API endpoints (users, chat history, request stats)
- Dashboard authentication
- Frontend SPA (user management, chat viewer, request log, stats)
- Plex user linking UI

**Rationale:** Largest scope. Depends on request tracking (Phase 1) and benefits from Plex/Tautulli (Phase 3) for user linking UI. Build after backend features stabilize.

### Phase 5: RCS Rich Messaging
- Twilio Content API integration
- MessagingProvider interface extension for rich content
- Rich card templates for search/discovery results
- Suggested reply buttons for common actions
- SMS fallback handling

**Rationale:** Depends on TMDB client (Phase 2) for poster URLs. Most impactful after discovery is working (more to show in cards). Highest risk/complexity phase due to Twilio Content API integration and provider interface changes.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase |
|---------|------------|---------------------|----------|-------|
| Role-based permissions | HIGH | LOW | P1 | 1 |
| Per-user request tracking | HIGH | LOW | P1 | 1 |
| Admin notification on requests | MEDIUM | LOW | P1 | 1 |
| Smart routing (anime) | MEDIUM | LOW | P1 | 1 |
| Smart routing (Asian movies) | MEDIUM | LOW | P1 | 1 |
| TMDB discovery tool | HIGH | MEDIUM | P1 | 2 |
| TMDB genre/actor/network search | HIGH | MEDIUM | P1 | 2 |
| Web search fallback | MEDIUM | MEDIUM | P2 | 2 |
| Plex library check | HIGH | MEDIUM | P1 | 3 |
| Season/episode availability | MEDIUM | MEDIUM | P2 | 3 |
| Tautulli watch history | MEDIUM | LOW-MEDIUM | P2 | 3 |
| Web admin dashboard | HIGH | HIGH | P1 | 4 |
| Plex user linking | MEDIUM | MEDIUM | P2 | 4 |
| RCS rich cards | MEDIUM | HIGH | P2 | 5 |
| RCS suggested replies | MEDIUM | MEDIUM | P2 | 5 |

**Priority key:**
- P1: Must have for v2.0 milestone -- core value delivery
- P2: Should have -- enhances the experience but not blocking

---

## Competitor Feature Comparison (v2.0 Features Only)

| Feature | Overseerr | Requestrr | Searcharr | WadsMedia v2.0 |
|---------|-----------|-----------|-----------|-----------------|
| TMDB discovery (genre/actor) | Trending page, basic browse | No | No | Natural language ("sci-fi movies with Timothee Chalamet") |
| Web search for vague queries | No | No | No | LLM-powered web search fallback |
| Plex library check | Yes (automatic) | No | No | Yes (per-user via linking) |
| Season/episode availability | Yes (partial indicator) | No | No | Yes ("You have S1-3, missing S4") |
| Tautulli integration | No | No | No | Watch history awareness |
| Admin dashboard | Full web UI (IS the product) | No | No | Lightweight admin panel |
| User management | Plex/Jellyfin auth + roles | Discord roles | Telegram user IDs | Phone whitelist + dashboard |
| Rich cards / posters | Web UI with posters | Discord embeds | Telegram inline images | RCS rich cards with poster + buttons |
| Interactive buttons | Web clicks | Discord buttons | Telegram inline keyboard | RCS suggested replies |
| Request tracking | Full (requested/approved/available) | Basic | No | Per-user with admin notifications |
| Permissions | Granular (manage, request, view) | Admin-only config | Admin-only adds | Admin (full) vs User (no delete) |
| Anime routing | No (delegates to Sonarr) | No | No | Auto-detect and route |
| Language-based routing | No | No | No | Auto-detect Asian languages |

---

## Sources

### TMDB API (HIGH confidence)
- [TMDB API Getting Started](https://developer.themoviedb.org/reference/intro/getting-started)
- [TMDB Search & Query](https://developer.themoviedb.org/docs/search-and-query-for-details)
- [TMDB Discover Movie](https://developer.themoviedb.org/reference/discover-movie) -- "over 30 filters and sort options"
- [TMDB Discover TV](https://developer.themoviedb.org/reference/discover-tv)
- [TMDB Image Basics](https://developer.themoviedb.org/docs/image-basics) -- poster URL format confirmed
- [TMDB Genre Movie List](https://developer.themoviedb.org/reference/genre-movie-list) -- genre ID mapping

### Plex API (MEDIUM-HIGH confidence)
- [Plex Media Server API](https://developer.plex.tv/pms/index.html)
- [Plex API Search](https://plexapi.dev/api-reference/search/perform-a-search) -- `/hubs/search` endpoint
- [Plexopedia: Get All Movies](https://www.plexopedia.com/plex-media-server/api/library/movies/) -- `includeGuids` parameter
- [Plexopedia: Get All TV Shows](https://www.plexopedia.com/plex-media-server/api/library/tvshows/) -- section endpoint
- [Plex Items Children](https://plexapi.dev/api-reference/library/get-items-children) -- `/library/metadata/{ratingKey}/children`
- [Plex Forum: Search by External ID](https://forums.plex.tv/t/pms-developer-api-search-library-with-external-id-eg-imdb/934815)

### Tautulli API (HIGH confidence)
- [Tautulli API Reference](https://docs.tautulli.com/extending-tautulli/api-reference)
- [Tautulli GitHub Wiki API Reference](https://github.com/Tautulli/Tautulli/wiki/Tautulli-API-Reference)

### Twilio RCS / Content API (HIGH confidence)
- [Twilio RCS Business Messaging](https://www.twilio.com/docs/rcs)
- [Twilio Card Content Type](https://www.twilio.com/docs/content/twiliocard) -- card structure, actions, limits
- [Twilio Content API Resources](https://www.twilio.com/docs/content/content-api-resources) -- programmatic template creation
- [Twilio Using Variables with Content API](https://www.twilio.com/docs/content/using-variables-with-content-api) -- dynamic media URLs confirmed
- [Twilio Send Templates](https://www.twilio.com/docs/content/send-templates-created-with-the-content-template-builder) -- `contentSid` + `contentVariables`
- [Twilio RCS Rich Content](https://www.twilio.com/en-us/blog/products/rich-content-rcs) -- cards, carousels, suggested replies
- [Twilio RCS Best Practices FAQ](https://help.twilio.com/articles/29076535334043-RCS-Messaging-Best-Practices-and-FAQ) -- automatic SMS fallback

### Sonarr/Radarr API (HIGH confidence -- verified against codebase)
- Sonarr schemas in `src/media/sonarr/sonarr.schemas.ts` -- `genres`, `seriesType` fields confirmed
- Radarr schemas in `src/media/radarr/radarr.schemas.ts` -- `.passthrough()` preserves `originalLanguage`
- Sonarr types in `src/media/sonarr/sonarr.types.ts` -- `AddSeriesInput.seriesType` already supports "anime"
- [Sonarr Settings (Servarr Wiki)](https://wiki.servarr.com/sonarr/settings) -- series type options
- [Radarr originalLanguage issue](https://github.com/Radarr/Radarr/issues/5970) -- field confirmed in API response

### Competitor Analysis (MEDIUM confidence -- mix of verified docs and training data)
- [Overseerr](https://overseerr.dev/) -- feature set, Plex integration, request workflow
- [Overseerr Guide (RapidSeedbox)](https://www.rapidseedbox.com/blog/overseerr-guide) -- permissions, tracking details

---
*Feature research for: WadsMedia v2.0 Smart Discovery & Admin*
*Researched: 2026-02-14*

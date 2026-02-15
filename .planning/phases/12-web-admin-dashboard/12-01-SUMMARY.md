---
phase: 12-web-admin-dashboard
plan: 01
subsystem: admin, api, database
tags: [fastify, eta, htmx, secure-session, admin-dashboard, drizzle]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Fastify server, database plugin, config pattern
  - phase: 03-user-management
    provides: users table schema, user.service.ts pattern
  - phase: 04-media-server-clients
    provides: Sonarr/Radarr clients with request() helper
  - phase: 10-permissions-user-tracking
    provides: media_tracking table for stats queries
  - phase: 11-plex-tautulli-integration
    provides: Plex/Tautulli clients with healthCheck() methods
provides:
  - Admin Fastify plugin with session-based auth (login/logout/requireAuth)
  - Admin service layer with 8 DB query functions
  - 13 route handlers covering dashboard, users, health, stats, Plex linking
  - plexUserId column on users table (Drizzle migration)
  - healthCheck() methods on all 4 media clients (Sonarr, Radarr, Plex, Tautulli)
  - Placeholder admin-views/ and admin-assets/ directories
affects: [12-02-PLAN, 12-03-PLAN]

# Tech tracking
tech-stack:
  added: ["@fastify/view", "@fastify/static", "@fastify/secure-session", "eta"]
  patterns: ["Eta template engine with viewAsync for htmx partials and full pages", "Secure session with secret+salt for admin auth", "Route generic interfaces for typed Fastify params/body/query"]

key-files:
  created:
    - src/admin/admin.plugin.ts
    - src/admin/admin.auth.ts
    - src/admin/admin.routes.ts
    - src/admin/admin.service.ts
    - admin-views/.gitkeep
    - admin-assets/.gitkeep
    - drizzle/0004_messy_blue_marvel.sql
  modified:
    - src/config.ts
    - src/db/schema.ts
    - src/media/sonarr/sonarr.client.ts
    - src/media/radarr/radarr.client.ts
    - src/server.ts
    - Dockerfile
    - package.json

key-decisions:
  - "Dockerfile COPY paths use repo-root admin-views/ and admin-assets/ (matching process.cwd() in plugin)"
  - "SessionData augmented via @fastify/secure-session module declaration for type-safe session.get/set"
  - "Route generics on fastify.get<T>/post<T> method (not handler callback) for Fastify 5 type compatibility"

patterns-established:
  - "Admin route generic interfaces: IdParams, IdParamsWithUserBody, IdParamsWithPagination, IdParamsWithPlexBody"
  - "htmx-aware route pattern: check hx-request header, return partial vs full page template"
  - "Admin plugin conditional registration: skip when ADMIN_SESSION_SECRET or ADMIN_PASSWORD not set"

# Metrics
duration: 5min
completed: 2026-02-15
---

# Phase 12 Plan 01: Admin Dashboard Backend Summary

**Fastify admin plugin with session auth, 8 service queries, 13 route handlers, Sonarr/Radarr healthCheck, and plexUserId schema migration**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-15T00:58:32Z
- **Completed:** 2026-02-15T01:03:52Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Complete admin backend infrastructure: plugin registers view engine (Eta), static file serving, secure sessions, and all route handlers
- Service layer with 8 DB query functions covering users, messages, media tracking stats, and Plex user linking
- All 4 media clients (Sonarr, Radarr, Plex, Tautulli) now have healthCheck() methods for system health dashboard
- Schema migration adding plexUserId to users table for per-user Tautulli watch history

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps, config, schema migration, healthCheck** - `2e1d37f` (feat)
2. **Task 2: Admin plugin, auth, service, routes, server, Dockerfile** - `8cfa656` (feat)

## Files Created/Modified
- `src/admin/admin.plugin.ts` - Fastify plugin registering view, static, session, and admin routes under /admin prefix
- `src/admin/admin.auth.ts` - requireAuth preHandler, loginHandler, logoutHandler with SessionData augmentation
- `src/admin/admin.routes.ts` - 13 route handlers with htmx-aware responses (partials vs full pages)
- `src/admin/admin.service.ts` - 8 DB query functions: getAllUsers, getUserById, updateUser, softDeleteUser, getUserMessages, getMediaTrackingStats, getRecentMediaAdditions, setPlexUserId
- `src/config.ts` - Added ADMIN_SESSION_SECRET (min 32 chars) and ADMIN_PASSWORD optional config vars
- `src/db/schema.ts` - Added plexUserId column to users table
- `src/media/sonarr/sonarr.client.ts` - Added healthCheck() method
- `src/media/radarr/radarr.client.ts` - Added healthCheck() method
- `src/server.ts` - Registered adminPlugin after notificationsPlugin
- `Dockerfile` - Added COPY lines for admin-views/ and admin-assets/
- `admin-views/.gitkeep` - Placeholder for template directory (populated in 12-02)
- `admin-assets/.gitkeep` - Placeholder for static assets directory (populated in 12-02)
- `drizzle/0004_messy_blue_marvel.sql` - Migration: ALTER TABLE users ADD plex_user_id
- `package.json` - Added @fastify/view, @fastify/static, @fastify/secure-session, eta

## Decisions Made
- Dockerfile COPY paths use repo-root `admin-views/` and `admin-assets/` matching `process.cwd()` in the plugin (plan originally suggested `src/admin-views/` which would not match the runtime path)
- SessionData augmented via `declare module "@fastify/secure-session"` (the global `SessionData` interface controls `session.get/set` key types)
- Route generics placed on `fastify.get<T>()`/`fastify.post<T>()` method calls rather than handler callback parameter types (required by Fastify 5's strict typing)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Dockerfile COPY paths for admin templates/assets**
- **Found during:** Task 2 (Dockerfile update)
- **Issue:** Plan specified `COPY src/admin-views/ ./admin-views/` but the plugin uses `path.join(process.cwd(), "admin-views")`, meaning directories should be at repo root, not under `src/`
- **Fix:** Used `COPY admin-views/ ./admin-views/` and placed placeholder dirs at repo root
- **Files modified:** Dockerfile
- **Verification:** Dockerfile COPY paths match process.cwd() paths in admin.plugin.ts
- **Committed in:** 8cfa656 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed TypeScript type errors in route handlers and session**
- **Found during:** Task 2 (TypeScript build)
- **Issue:** Fastify 5 requires route generics on the method call `fastify.get<T>()`, not on handler callback type annotations; SessionData needs module augmentation for @fastify/secure-session
- **Fix:** Moved generic interfaces to route method calls; added `declare module "@fastify/secure-session"` with SessionData augmentation
- **Files modified:** src/admin/admin.routes.ts, src/admin/admin.auth.ts
- **Verification:** `npm run build` compiles without errors
- **Committed in:** 8cfa656 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required

**External services require manual configuration.** Admin dashboard is opt-in. To enable:

**Environment variables to add:**
- `ADMIN_SESSION_SECRET` - Generate with `openssl rand -hex 32` (minimum 32 characters)
- `ADMIN_PASSWORD` - Choose a password for dashboard login

**Verification:** Server starts cleanly without these vars (admin plugin skipped with warning). With them set, admin routes register at `/admin`.

## Next Phase Readiness
- Backend fully ready for 12-02 (frontend templates): all routes return viewAsync calls that will resolve once Eta templates exist in admin-views/
- Service layer ready for 12-03 (stats/Plex linking): all query functions exported and tested at type level
- Templates will fail at runtime until 12-02 populates admin-views/ -- this is expected and documented

## Self-Check: PASSED

All 7 created files verified on disk. Both task commits (2e1d37f, 8cfa656) verified in git log. All 8 must-have truths confirmed via grep.

---
*Phase: 12-web-admin-dashboard*
*Completed: 2026-02-15*

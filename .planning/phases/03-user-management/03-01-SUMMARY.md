---
phase: 03-user-management
plan: 01
subsystem: database, auth
tags: [drizzle-orm, sqlite, fastify-plugin, user-resolution, phone-identity]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Drizzle ORM schema, database plugin with auto-migration, Fastify server structure"
  - phase: 02-messaging-gateway
    provides: "Webhook pipeline with Twilio signature validation and parsed inbound messages"
provides:
  - "users table with phone (unique), displayName, status, isAdmin, timestamps"
  - "User service module: findUserByPhone, createUser, upsertUser, updateUserStatus, updateDisplayName"
  - "User, NewUser, UserStatus type exports"
  - "user-resolver Fastify plugin with admin/whitelist seeding on startup"
  - "fastify.resolveUser preHandler for route-level user resolution"
affects: [03-user-management, 05-conversation-engine, 06-search, 07-library-management]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "User service as pure functions with db parameter (dependency injection)"
    - "Fastify plugin startup seeding for admin and whitelist users"
    - "Request decoration with null initial value for reference types"
    - "resolveUser as fastify.decorate for route-level preHandler access"

key-files:
  created:
    - src/db/schema.ts (extended with users table)
    - src/users/user.types.ts
    - src/users/user.service.ts
    - src/plugins/user-resolver.ts
    - drizzle/0001_remarkable_tomas.sql
  modified:
    - src/server.ts

key-decisions:
  - "User service uses pure functions with db parameter (dependency injection), consistent with codebase pattern"
  - "resolveUser exposed via fastify.decorate rather than global hook, enabling route-level preHandler usage"
  - "Admin phone seeded before whitelist iteration to preserve isAdmin flag"
  - "Whitelist phones that match admin phone are skipped during seeding to avoid overwriting isAdmin"

patterns-established:
  - "User service pure functions: all take db as first argument for testability"
  - "Plugin startup seeding: upsert admin and whitelist users during plugin registration"
  - "Route-level preHandler via fastify.decorate: plugins expose preHandlers on fastify instance"

# Metrics
duration: 2min
completed: 2026-02-14
---

# Phase 3 Plan 1: User Data Layer and Resolver Plugin Summary

**Users table with phone-based identity, CRUD service module, and Fastify plugin that seeds admin/whitelist users on startup and exposes resolveUser preHandler**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-14T02:30:02Z
- **Completed:** 2026-02-14T02:32:11Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Users table added to Drizzle schema with phone (unique), displayName, status enum, isAdmin boolean, and timestamps
- User service module with five pure functions: findUserByPhone, createUser, upsertUser, updateUserStatus, updateDisplayName
- User-resolver Fastify plugin that seeds admin and whitelist users on startup, decorates request.user, and exposes fastify.resolveUser preHandler
- Migration auto-generated and verified to apply on startup

## Task Commits

Each task was committed atomically:

1. **Task 1: Users table schema and user service module** - `b669b40` (feat)
2. **Task 2: User-resolver Fastify plugin with startup seeding** - `ff1d6f3` (feat)

## Files Created/Modified
- `src/db/schema.ts` - Extended with users table (phone unique, status enum, isAdmin boolean, timestamps)
- `src/users/user.types.ts` - User, NewUser, UserStatus type exports inferred from schema
- `src/users/user.service.ts` - Pure functions for user CRUD: findByPhone, create, upsert, updateStatus, updateDisplayName
- `src/plugins/user-resolver.ts` - Fastify plugin: seeds admin/whitelist on startup, decorates request.user, exposes resolveUser
- `src/server.ts` - Registers userResolverPlugin after database and before webhook
- `drizzle/0001_remarkable_tomas.sql` - Migration SQL for users table with unique index on phone

## Decisions Made
- User service uses pure functions with db parameter (dependency injection), matching the established codebase pattern from database plugin
- resolveUser exposed via fastify.decorate (not a global hook) so webhook can use it at the route level as a preHandler
- Admin phone seeded first before whitelist iteration; whitelist entries matching admin phone are skipped to preserve isAdmin=true
- No new npm dependencies needed -- all libraries already installed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- User data layer complete, ready for plan 03-02 (webhook integration with user resolution)
- fastify.resolveUser available as preHandler for webhook route
- Admin and whitelist users are seeded on startup and ready for authorization checks

## Self-Check: PASSED

All 6 files verified present. Both commit hashes (b669b40, ff1d6f3) verified in git log.

---
*Phase: 03-user-management*
*Completed: 2026-02-14*

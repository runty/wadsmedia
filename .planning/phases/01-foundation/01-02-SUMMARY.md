---
phase: 01-foundation
plan: 02
subsystem: database
tags: [sqlite, drizzle-orm, better-sqlite3, wal-mode, fastify-plugin, migrations]

# Dependency graph
requires:
  - phase: 01-01
    provides: "ESM TypeScript project skeleton with Fastify server factory and config"
provides:
  - "SQLite database with WAL mode and performance pragmas via better-sqlite3"
  - "Drizzle ORM schema definitions with appMetadata table"
  - "Automatic migration on server startup via drizzle-orm migrator"
  - "Database accessible on Fastify instance via fastify.db decorator"
  - "Graceful database shutdown on server close"
  - "Drizzle Kit migration generation pipeline"
affects: [01-03, all-phases]

# Tech tracking
tech-stack:
  added: []
  patterns: [drizzle-schema-as-typescript, wal-mode-pragmas, fastify-plugin-decorator, auto-migrate-on-startup, createDatabase-factory]

key-files:
  created:
    - src/db/schema.ts
    - src/db/index.ts
    - src/plugins/database.ts
    - drizzle.config.ts
    - drizzle/0000_wide_black_cat.sql
  modified:
    - src/server.ts
    - .gitignore

key-decisions:
  - "Exported DatabaseConnection interface from db/index.ts to satisfy TypeScript declaration emit with verbatimModuleSyntax"
  - "Un-ignored drizzle/ directory from .gitignore -- migration SQL files must be tracked for runtime migrate() in production/Docker"
  - "Resolved migrations folder relative to import.meta.url for portability between dev (tsx) and production (compiled dist/)"

patterns-established:
  - "Database factory: createDatabase(path) returns { db, sqlite } for separation of ORM and raw connection"
  - "Fastify plugin pattern: fp() wrapper breaks encapsulation, decorate() exposes db globally"
  - "SQLite pragmas: WAL, synchronous=normal, foreign_keys=ON, busy_timeout=5000 applied immediately after connection"
  - "Migration path: path.join(__dirname, '../../drizzle') from dist/plugins/ to reach project root drizzle/"

# Metrics
duration: 3min
completed: 2026-02-14
---

# Phase 1 Plan 02: Database Layer Summary

**SQLite persistence with Drizzle ORM, WAL mode, auto-migration on startup, and Fastify plugin registration**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-14T00:57:53Z
- **Completed:** 2026-02-14T01:00:41Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Drizzle ORM schema with appMetadata table proving migration system works
- Database connection factory with WAL mode and performance pragmas
- Fastify plugin that auto-migrates and decorates instance with `fastify.db`
- Graceful shutdown closing SQLite connection on server close
- Drizzle Kit pipeline for future schema-driven migration generation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create database schema, connection factory, and generate initial migration** - `9aa47cd` (feat)
2. **Task 2: Create database Fastify plugin and register in server** - `3a55df6` (feat)

## Files Created/Modified
- `src/db/schema.ts` - Drizzle table definition for app_metadata (key, value, updatedAt)
- `src/db/index.ts` - createDatabase() factory with WAL pragmas, exports DatabaseConnection interface
- `drizzle.config.ts` - Drizzle Kit config: dialect sqlite, schema path, output to drizzle/
- `drizzle/0000_wide_black_cat.sql` - Initial migration SQL creating app_metadata table
- `src/plugins/database.ts` - Fastify plugin: creates DB, runs migrations, decorates instance, closes on shutdown
- `src/server.ts` - Added databasePlugin registration in buildServer factory
- `.gitignore` - Un-ignored drizzle/ so migration files are tracked in git

## Decisions Made
- **DatabaseConnection interface:** TypeScript's `verbatimModuleSyntax` + `declaration: true` required an explicit interface for the createDatabase return type. Without it, the compiled .d.ts could not reference `BetterSqlite3.Database` by name. Exported `DatabaseConnection` interface with `db` and `sqlite` properties.
- **Un-ignored drizzle/ migrations:** The initial .gitignore from plan 01-01 excluded `drizzle/`. Migration SQL files must be committed to git because the runtime `migrate()` call reads them at startup, and Docker COPY needs them in the image. Replaced the ignore with a comment explaining why.
- **Migration path resolution:** Used `path.join(__dirname, '../../drizzle')` where `__dirname` is derived from `import.meta.url`. This works from both `dist/plugins/` (compiled) and during tsx development, and will work in Docker where drizzle/ is copied alongside dist/.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript declaration emit for createDatabase return type**
- **Found during:** Task 1 (Build verification)
- **Issue:** `tsc` errored with TS4058: return type uses `BetterSqlite3.Database` from external module but cannot be named. Caused by `verbatimModuleSyntax` + `declaration: true` requiring explicit types for exported functions.
- **Fix:** Added explicit `DatabaseConnection` interface with typed `db` and `sqlite` properties, and used it as the return type annotation.
- **Files modified:** src/db/index.ts
- **Verification:** `npm run build` succeeds
- **Committed in:** 9aa47cd (Task 1 commit)

**2. [Rule 1 - Bug] Un-ignored drizzle/ migration files in .gitignore**
- **Found during:** Task 1 (Pre-commit staging)
- **Issue:** `.gitignore` from plan 01-01 excluded `drizzle/`, but migration SQL files must be version-controlled for runtime `migrate()` and Docker deployment.
- **Fix:** Replaced `drizzle/` ignore line with a comment explaining migrations are tracked.
- **Files modified:** .gitignore
- **Verification:** `git status` shows drizzle/ as trackable, migration files committed
- **Committed in:** 9aa47cd (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes were necessary for correct compilation and deployment. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Database layer fully operational with auto-migration on startup
- `fastify.db` decorator available for all plugins and routes
- Future schema changes: add tables to `src/db/schema.ts`, run `npm run db:generate`
- Ready for Plan 03 (Docker packaging) which will COPY drizzle/ into the image
- Ready for Phase 2+ which will add tables for users, conversations, messages

---
*Phase: 01-foundation*
*Completed: 2026-02-14*

# Phase 3: User Management - Research

**Researched:** 2026-02-13
**Domain:** Phone-based user authorization, onboarding flow, and data isolation with Drizzle ORM + Fastify
**Confidence:** HIGH

## Summary

Phase 3 adds user identity to the existing webhook pipeline. Every inbound SMS/RCS message already arrives with a `From` phone number (E.164 format) via the Phase 2 webhook. This phase uses that phone number as the primary identity key to resolve a user, authorize them, or trigger an onboarding flow for unknowns. The data model is straightforward: a `users` table with phone number as unique key, a status field tracking authorization state, and a display name. Conversation isolation (USER-05) is achieved by scoping all future queries with a `userId` foreign key -- this phase establishes the user record and the lookup mechanism that later phases depend on.

The onboarding flow for unknown users is a simple two-step state machine: (1) app asks for their name, (2) app texts the admin for approval. While the user is pending approval, they receive a "waiting for approval" response. The admin approves by replying to the approval request (handled in a future phase or via direct database/whitelist update -- the REQUIREMENTS doc explicitly says "Whitelist IS the approval" under Out of Scope, meaning full approval workflows are out of scope). The simplest approach consistent with the requirements: unknown user texts in, gets asked their name, admin gets notified, and the user is added to the system in a `pending` state. The admin can approve by adding the number to `PHONE_WHITELIST` env var and restarting, or the system can auto-approve on the next message if the number appears in the whitelist.

The technical approach uses: (1) a Drizzle ORM `users` table with phone, displayName, and status columns, (2) a Fastify `preHandler` hook on the webhook route that resolves/creates the user and attaches it to the request, (3) the existing `PHONE_WHITELIST` and `ADMIN_PHONE` config values, and (4) the existing `fastify.messaging.send()` for admin notifications.

**Primary recommendation:** Add a `users` table to the Drizzle schema, create a user service module with `findOrCreateByPhone()` logic, wire it as a Fastify `preHandler` on the webhook route that attaches the resolved user to `request.user`, and use the existing messaging provider to notify the admin about new user requests.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | ^0.45.1 (installed) | Define users table schema, run queries | Already in use for appMetadata table |
| `better-sqlite3` | ^12.6.2 (installed) | SQLite driver | Already in use |
| `fastify` | ^5.7.4 (installed) | preHandler hooks, request decoration | Already in use |
| `fastify-plugin` | ^5.1.0 (installed) | Plugin encapsulation | Already in use |
| `zod` | ^4.3.6 (installed) | Config validation for ADMIN_PHONE, PHONE_WHITELIST | Already in use |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `drizzle-kit` | ^0.31.9 (installed) | Generate migration SQL for new users table | After schema changes |
| `vitest` | ^4.0.18 (installed) | Unit tests for user service logic | Testing user resolution, authorization |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Phone number as identity | JWT/session tokens | Unnecessary complexity for SMS -- phone number IS the identity token |
| SQLite users table | In-memory Map from PHONE_WHITELIST | Loses display names, pending state, persistence across restarts |
| preHandler hook | Fastify `onRequest` hook | preHandler runs after body parsing, which we need for the parsed `From` field |

**Installation:**
```bash
# No new dependencies needed -- all libraries already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/
│   ├── schema.ts          # Add users table (extend existing file)
│   └── index.ts           # Existing database factory
├── users/
│   ├── user.service.ts    # findByPhone, findOrCreate, updateStatus, resolveUser
│   └── user.types.ts      # User type exports (from schema $inferSelect)
├── plugins/
│   ├── user-resolver.ts   # Fastify plugin: preHandler that resolves user from phone
│   ├── database.ts        # Existing
│   ├── messaging.ts       # Existing
│   └── webhook.ts         # Modified: uses resolved user, handles onboarding responses
├── messaging/
│   └── types.ts           # Existing MessagingProvider interface
└── config.ts              # Make ADMIN_PHONE required, keep PHONE_WHITELIST optional
```

### Pattern 1: Users Table Schema
**What:** Drizzle ORM table definition for user records with phone as unique key and status enum.
**When to use:** Always -- this is the core data model for this phase.
**Example:**
```typescript
// Source: https://orm.drizzle.team/docs/column-types/sqlite
// src/db/schema.ts (additions)

import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  phone: text("phone").notNull().unique(),
  displayName: text("display_name"),
  status: text("status", { enum: ["active", "pending", "blocked"] })
    .notNull()
    .default("pending"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

### Pattern 2: User Service (Pure Functions over DB)
**What:** A service module that encapsulates user lookup, creation, and status logic. Takes the Drizzle `db` instance as a parameter (dependency injection, not a singleton).
**When to use:** All user operations.
**Example:**
```typescript
// src/users/user.service.ts
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { users } from "../db/schema.js";
import type * as schema from "../db/schema.js";

type DB = BetterSQLite3Database<typeof schema>;

export function findUserByPhone(db: DB, phone: string) {
  return db.select().from(users).where(eq(users.phone, phone)).get();
}

export function createUser(db: DB, phone: string, displayName?: string, status: "active" | "pending" = "pending") {
  return db.insert(users)
    .values({ phone, displayName, status })
    .returning()
    .get();
}

export function updateUserStatus(db: DB, phone: string, status: "active" | "pending" | "blocked") {
  return db.update(users)
    .set({ status, updatedAt: new Date() })
    .where(eq(users.phone, phone))
    .returning()
    .get();
}

export function updateDisplayName(db: DB, phone: string, displayName: string) {
  return db.update(users)
    .set({ displayName, updatedAt: new Date() })
    .where(eq(users.phone, phone))
    .returning()
    .get();
}
```

### Pattern 3: User Resolver preHandler Hook
**What:** A Fastify preHandler that resolves the inbound phone number to a user record, handles authorization, and attaches the user to the request.
**When to use:** On the webhook route, after signature validation.
**Example:**
```typescript
// src/plugins/user-resolver.ts
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import type { User } from "../db/schema.js";
import { findUserByPhone, createUser } from "../users/user.service.js";

// Augment FastifyRequest to include user
declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    // Decorate request with null initial value (Fastify requirement for reference types)
    fastify.decorateRequest("user", null);

    // The actual resolution logic is exposed as a named function
    // so the webhook plugin can use it as a preHandler
  },
  { name: "user-resolver", dependencies: ["database"] },
);
```

### Pattern 4: Onboarding State Machine
**What:** Simple state machine for unknown user onboarding: unknown -> asked_name -> pending_approval -> active.
**When to use:** When a message arrives from an unknown phone number.
**Flow:**
```
Message from unknown number
  |
  v
Is phone in PHONE_WHITELIST?
  |-- YES --> Create user as "active", respond normally
  |-- NO  --> Is there an existing "pending" user record?
                |-- NO  --> Ask for name, create record as "pending"
                |-- YES --> Has name been provided?
                              |-- NO  --> Store name from message body, notify admin
                              |-- YES --> Reply "waiting for approval"
```

### Anti-Patterns to Avoid
- **Storing phone numbers without normalization:** Twilio sends E.164 format (+15551234567). Store exactly this format. Do NOT strip the `+` or country code. Comparison must be exact string match.
- **Checking whitelist on every request without caching:** The `PHONE_WHITELIST` env var is parsed once at startup by Zod. Use `fastify.config.PHONE_WHITELIST` (already an array). No need to re-parse.
- **Putting user resolution logic in the webhook handler:** Separate concerns. The webhook handler should receive a resolved `request.user` and focus on message routing, not user management.
- **Using Fastify `onRequest` hook for user resolution:** The phone number comes from the parsed request body (`Body.From`), which is only available after body parsing (i.e., in `preHandler`, not `onRequest`).
- **Global preHandler for user resolution:** Only the webhook route needs user resolution. Health check and other routes should not require a user. Register the preHandler at the route level, not globally.
- **Sharing mutable reference types in decorateRequest:** Fastify reuses the decoration across requests. For objects, initialize with `null` and set per-request values in a hook. The pattern `fastify.decorateRequest("user", null)` is correct.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Phone number storage/lookup | Custom file-based user store | Drizzle ORM `users` table with `.unique()` constraint | Persistence, indexing, atomic operations, migration support |
| Schema migrations | Manual SQL scripts | `drizzle-kit generate` + auto-migration on startup | Already established pattern in Phase 1 |
| E.164 phone validation | Custom regex | Trust Twilio's `From` field (already E.164) | Twilio guarantees E.164 format for `From`; re-validating adds complexity with no benefit |
| User type definitions | Manual interface declarations | `typeof users.$inferSelect` / `$inferInsert` | Types stay in sync with schema automatically |

**Key insight:** The user identity problem is already solved by the messaging provider -- Twilio provides a verified phone number with every inbound message. There is no authentication challenge here, only authorization (is this number allowed?).

## Common Pitfalls

### Pitfall 1: Phone Number Format Mismatch
**What goes wrong:** User lookup fails because stored format differs from incoming format.
**Why it happens:** Mixing formats (e.g., `5551234567` vs `+15551234567` vs `(555) 123-4567`).
**How to avoid:** Always store and compare in E.164 format (as Twilio provides). The `PHONE_WHITELIST` env var should also use E.164 format. Document this requirement.
**Warning signs:** Whitelisted users are not recognized; lookup returns null for known numbers.

### Pitfall 2: Race Condition on First Message
**What goes wrong:** Two simultaneous messages from a new user create duplicate records.
**Why it happens:** Two webhook requests arrive before either creates the user record.
**How to avoid:** Use `INSERT ... ON CONFLICT DO NOTHING` or `ON CONFLICT DO UPDATE` (Drizzle's `onConflictDoNothing` / `onConflictDoUpdate`). The `phone` column's UNIQUE constraint prevents duplicates at the database level. Alternatively, since better-sqlite3 is synchronous and single-threaded, this is less of a concern than with async databases, but the upsert pattern is still best practice.
**Warning signs:** UNIQUE constraint violation errors in logs.

### Pitfall 3: Admin Phone Not in Whitelist
**What goes wrong:** Admin cannot use the app because their phone number is in `ADMIN_PHONE` but not in `PHONE_WHITELIST`.
**How to avoid:** The admin phone should be automatically treated as an authorized user regardless of whitelist. During user resolution, check `ADMIN_PHONE` in addition to `PHONE_WHITELIST`.
**Warning signs:** Admin texts the app and gets the "unknown user" onboarding flow.

### Pitfall 4: Forgetting to Update Schema Import in db/index.ts
**What goes wrong:** Drizzle relational queries don't work, or type inference is wrong.
**Why it happens:** The `createDatabase` function imports `* as schema` from `./schema.js`. Adding new tables to `schema.ts` automatically includes them, BUT only if the import is `* as schema` (which it already is -- verified in the codebase).
**How to avoid:** No action needed. The existing `import * as schema from "./schema.js"` pattern already picks up new table exports.
**Warning signs:** None -- the existing pattern is correct.

### Pitfall 5: Not Seeding Admin User on Startup
**What goes wrong:** First message from admin triggers onboarding flow instead of normal operation.
**Why it happens:** No user record exists for the admin phone until they first text.
**How to avoid:** On startup (in the user-resolver plugin registration), check if `ADMIN_PHONE` has a user record. If not, create one with status `active` and `isAdmin: true`. Also seed any `PHONE_WHITELIST` numbers as active users.
**Warning signs:** Admin gets "What's your name?" on first text.

### Pitfall 6: Webhook Handler Coupling to User States
**What goes wrong:** The webhook handler becomes a giant if/else tree checking user status.
**Why it happens:** Mixing message routing logic with user state machine logic.
**How to avoid:** The preHandler resolves the user. The handler checks `request.user.status` and routes accordingly. Keep the state transitions in the user service, not the handler. The onboarding conversation (asking for name, notifying admin) should be its own module, not inline in the webhook handler.
**Warning signs:** Webhook handler file grows past 100 lines.

## Code Examples

Verified patterns from official sources:

### Drizzle ORM: Define Users Table with Unique Constraint
```typescript
// Source: https://orm.drizzle.team/docs/column-types/sqlite
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  phone: text("phone").notNull().unique(),
  displayName: text("display_name"),
  status: text("status", { enum: ["active", "pending", "blocked"] })
    .notNull()
    .default("pending"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

### Drizzle ORM: Upsert Pattern (Insert or Update on Conflict)
```typescript
// Source: https://orm.drizzle.team/docs/insert
import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";

// Insert new user, or update if phone already exists
const user = db.insert(users)
  .values({ phone: "+15551234567", status: "active" })
  .onConflictDoUpdate({
    target: users.phone,
    set: { status: "active", updatedAt: new Date() },
  })
  .returning()
  .get();
```

### Drizzle ORM: Select with Where Clause
```typescript
// Source: https://orm.drizzle.team/docs/select
import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";

const user = db.select().from(users).where(eq(users.phone, "+15551234567")).get();
// Returns User | undefined
```

### Drizzle ORM: Update with Returning
```typescript
// Source: https://orm.drizzle.team/docs/update
import { eq } from "drizzle-orm";
import { users } from "../db/schema.js";

const updated = db.update(users)
  .set({ displayName: "Alice", updatedAt: new Date() })
  .where(eq(users.phone, "+15551234567"))
  .returning()
  .get();
```

### Fastify: Decorate Request with User (TypeScript)
```typescript
// Source: https://fastify.dev/docs/latest/Reference/Decorators/
// Source: https://fastify.dev/docs/latest/Reference/Hooks/
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type { User } from "../db/schema.js";

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }
}

export default fp(
  async (fastify: FastifyInstance) => {
    // Initialize with null -- reference types must NOT be shared across requests
    fastify.decorateRequest("user", null);
  },
  { name: "user-resolver", dependencies: ["database"] },
);
```

### Fastify: Route-Level preHandler for User Resolution
```typescript
// Source: https://fastify.dev/docs/latest/Reference/Hooks/
fastify.post(
  "/webhook/twilio",
  {
    preHandler: [validateTwilioSignature, resolveUser],
  },
  async (request, reply) => {
    // request.user is now populated
    const user = request.user;
    if (!user || user.status !== "active") {
      // Handle non-active users (onboarding, blocked, etc.)
      return reply.type("text/xml").send(fastify.messaging.formatReply("..."));
    }
    // Normal message handling for active users
  },
);
```

### Sending Admin Notification
```typescript
// Using existing MessagingProvider interface
const adminPhone = fastify.config.ADMIN_PHONE;
if (adminPhone) {
  await fastify.messaging.send({
    to: adminPhone,
    body: `New user request: ${displayName} (${phone}). Add their number to PHONE_WHITELIST to approve.`,
    from: fastify.config.TWILIO_PHONE_NUMBER,
  });
}
```

### Generate Migration After Schema Change
```bash
# After adding users table to src/db/schema.ts
npm run db:generate
# This creates a new SQL migration file in ./drizzle/
# Auto-migration on startup (existing pattern) will apply it
```

### Testing User Service with In-Memory SQLite
```typescript
// Source: better-sqlite3 docs, Drizzle ORM setup
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../db/schema.js";
import { findUserByPhone, createUser } from "./user.service.js";

// In-memory database for tests
const sqlite = new Database(":memory:");
const db = drizzle(sqlite, { schema });

// Apply migrations (or push schema directly for tests)
migrate(db, { migrationsFolder: "./drizzle" });

// Test
const user = createUser(db, "+15551234567", "Test User", "active");
const found = findUserByPhone(db, "+15551234567");
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual SQL migrations | `drizzle-kit generate` + auto-apply on startup | Already established Phase 1 | Use existing migration workflow |
| `drizzle-orm` `InferSelectModel<>` helper | `typeof table.$inferSelect` | Drizzle 0.30+ | Both work; `$inferSelect` is more concise |
| Separate interface files for types | Export types from schema file | Convention | Single source of truth for data shapes |

**Deprecated/outdated:**
- `InferModel<typeof table>` (old Drizzle API): Replaced by `$inferSelect` / `$inferInsert`

## Open Questions

1. **Admin approval mechanism**
   - What we know: REQUIREMENTS.md Out of Scope says "Approval workflow / request system -- Over-engineering for personal/household servers. Whitelist IS the approval." USER-03 says "Unknown numbers prompted for their name, then admin texted for approval."
   - What's unclear: Does "admin texted for approval" mean a full interactive approval flow (admin replies YES/NO), or just a notification to the admin who then updates the whitelist?
   - Recommendation: Implement as notification-only. Admin gets a text saying "New user: Name (phone). Add to PHONE_WHITELIST to approve." On next app restart (or a config reload), users whose phones now appear in the whitelist get auto-promoted to active. This matches the Out of Scope guidance. If a runtime approval command is desired later, it can be added as a conversation command in Phase 5+.

2. **Should PHONE_WHITELIST be required or optional?**
   - What we know: Currently optional in config.ts. If empty/missing, no users are pre-authorized.
   - What's unclear: Should the app function with no whitelist (everyone goes through onboarding) or require at least the admin?
   - Recommendation: Keep `PHONE_WHITELIST` optional. Make `ADMIN_PHONE` required for this phase (since admin must exist to receive approval notifications). If no whitelist, only admin is pre-authorized. All others go through onboarding.

3. **Pending user message handling**
   - What we know: USER-03 says unknown users are prompted for name, then admin is notified.
   - What's unclear: What happens when a pending user sends additional messages before approval?
   - Recommendation: Reply with a fixed message: "Your request is pending approval. You'll be notified when approved." Do not process their messages as commands. This is simple and prevents confusion.

4. **Conversation isolation implementation**
   - What we know: USER-05 requires per-user conversation isolation.
   - What's unclear: Whether to add a `conversations` / `messages` table now or defer to Phase 5.
   - Recommendation: Defer the conversations/messages tables to Phase 5 (Conversation Engine). Phase 3 establishes the `users` table with the `id` that Phase 5 will use as a foreign key. The isolation guarantee is that all future conversation queries will include `WHERE userId = ?`. Phase 3 proves isolation by ensuring each webhook request has a resolved `request.user` with a unique ID.

## Sources

### Primary (HIGH confidence)
- [Drizzle ORM SQLite Column Types](https://orm.drizzle.team/docs/column-types/sqlite) - integer mode: boolean/timestamp, text enum, $defaultFn
- [Drizzle ORM Schema Declaration](https://orm.drizzle.team/docs/sql-schema-declaration) - sqliteTable, column definitions, unique constraints
- [Drizzle ORM Insert](https://orm.drizzle.team/docs/insert) - insert, onConflictDoUpdate, onConflictDoNothing, returning
- [Drizzle ORM Select](https://orm.drizzle.team/docs/select) - select, where, eq operator
- [Drizzle ORM Update](https://orm.drizzle.team/docs/update) - update, set, where, returning
- [Drizzle ORM Indexes & Constraints](https://orm.drizzle.team/docs/indexes-constraints) - unique(), uniqueIndex(), foreign keys
- [Drizzle ORM Type Helpers](https://orm.drizzle.team/docs/goodies) - $inferSelect, $inferInsert
- [Fastify Hooks Reference](https://fastify.dev/docs/latest/Reference/Hooks/) - preHandler, onRequest, hook ordering, short-circuiting
- [Fastify Decorators Reference](https://fastify.dev/docs/latest/Reference/Decorators/) - decorateRequest, null initialization for reference types
- [Fastify TypeScript Reference](https://fastify.dev/docs/latest/Reference/TypeScript/) - module augmentation, FastifyRequest interface extension

### Secondary (MEDIUM confidence)
- [Fastify Discussion #5100](https://github.com/fastify/fastify/discussions/5100) - decorateRequest TypeScript patterns, community-verified
- Existing codebase patterns (src/plugins/database.ts, src/plugins/webhook.ts) - established plugin structure

### Tertiary (LOW confidence)
- None. All findings verified against official docs or existing codebase.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and in use; no new dependencies
- Architecture: HIGH - Extends established patterns from Phase 1/2 (Fastify plugins, Drizzle schema, preHandler hooks)
- Pitfalls: HIGH - Phone format, race conditions, admin seeding are well-understood problems with clear solutions
- Onboarding flow: MEDIUM - The exact admin approval mechanism depends on interpretation of USER-03 vs Out of Scope guidance (notification-only recommended)

**Research date:** 2026-02-13
**Valid until:** 2026-03-15 (all libraries are stable, no fast-moving dependencies)

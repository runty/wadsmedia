# Phase 12: Web Admin Dashboard - Research

**Researched:** 2026-02-14
**Domain:** Server-side rendered web dashboard with htmx, Fastify backend API, session auth
**Confidence:** HIGH

## Summary

Phase 12 adds a web admin dashboard to the existing Fastify server. The dashboard needs: user management (CRUD), chat history viewer, system health/stats, and Plex user linking. The prior decisions explicitly call out htmx for interactivity (no SPA framework), simple auth (no OAuth/SSO), and htmx polling (no WebSockets).

The recommended stack is `@fastify/view` + Eta templates for server-side HTML rendering, `@fastify/static` for serving htmx and CSS from a bundled assets directory, and `@fastify/secure-session` for stateless cookie-based admin authentication. All dashboard routes live under a `/admin` prefix and are protected by a preHandler hook that validates the session. The API routes that power htmx partial responses live under `/admin/api`.

**Primary recommendation:** Use Eta templates rendered by `@fastify/view` with htmx 2.0 for interactivity, `@fastify/secure-session` for stateless cookie auth with a secret from an env var, and serve all dashboard content from the same Fastify server under the `/admin` prefix.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@fastify/view` | ^11.1.1 | Template rendering (reply.viewAsync) | Official Fastify plugin for server-side HTML |
| `eta` | ^4.5.1 | Template engine (lightweight, TypeScript-native) | Fastest Fastify-compatible engine, written in TS, supports layouts |
| `@fastify/static` | ^9.0.0 | Serve htmx.min.js + CSS from /admin/assets | Official Fastify static file plugin |
| `@fastify/secure-session` | ^8.3.0 | Stateless encrypted cookie session | No database/store needed, libsodium encryption, official Fastify |
| `htmx` (CDN or vendored) | 2.0.8 | Hypermedia-driven UI interactions | Declared in prior decisions; no JS framework needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@fastify/cookie` | (peer dep) | Cookie parsing for secure-session | Required by @fastify/secure-session |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Eta + @fastify/view | @kitajs/html (JSX) | JSX requires tsconfig.json changes (jsx, jsxFactory), Biome config changes, more intrusive to existing codebase |
| Eta + @fastify/view | EJS or Handlebars | EJS lacks TypeScript types; Handlebars is heavier; Eta is fastest and TS-native |
| @fastify/secure-session | @fastify/session + store | Requires a session store (memory leaks in prod, or SQLite adapter); secure-session is stateless |
| Vendored htmx.min.js | CDN-hosted htmx | Vendored avoids external dependency; dashboard may be on private network without internet |

**Installation:**
```bash
npm install @fastify/view @fastify/static @fastify/secure-session eta
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── admin/
│   ├── admin.plugin.ts        # Fastify plugin: registers view, static, session, routes
│   ├── admin.routes.ts         # Route handlers (GET /admin, GET /admin/users, etc.)
│   ├── admin.auth.ts           # Login/logout handlers + session preHandler hook
│   └── admin.service.ts        # DB queries (getAllUsers, getUserMessages, getStats, etc.)
├── admin-views/                # Eta template files (.eta)
│   ├── layouts/
│   │   └── main.eta            # Base HTML layout (head, nav, htmx script, CSS)
│   ├── pages/
│   │   ├── login.eta           # Login form
│   │   ├── dashboard.eta       # Home: stats + health
│   │   ├── users.eta           # User list table
│   │   ├── user-detail.eta     # Single user: edit form + chat history
│   │   └── plex-link.eta       # Plex user linking UI
│   └── partials/
│       ├── user-row.eta        # Single table row (htmx swap target)
│       ├── chat-messages.eta   # Chat history message list
│       ├── health-status.eta   # Service health indicators
│       └── stats-cards.eta     # Request count + media stats cards
```

**Note:** Template files (`admin-views/`) live inside `src/` during development. The Dockerfile must copy them to the production image (they are not compiled by `tsc`).

### Pattern 1: Fastify Plugin Encapsulation
**What:** All dashboard functionality lives inside a single Fastify plugin registered with a `/admin` prefix
**When to use:** Always -- keeps dashboard isolated from the existing webhook/API surface
**Example:**
```typescript
// src/admin/admin.plugin.ts
import fp from "fastify-plugin";
import view from "@fastify/view";
import fastifyStatic from "@fastify/static";
import secureSession from "@fastify/secure-session";
import { Eta } from "eta";

export default fp(async (fastify) => {
  // Register view engine
  const eta = new Eta({ views: path.join(__dirname, "../admin-views") });
  await fastify.register(view, {
    engine: { eta },
    root: path.join(__dirname, "../admin-views"),
    viewExt: "eta",
    defaultContext: { /* shared template data */ },
  });

  // Register static files for /admin/assets
  await fastify.register(fastifyStatic, {
    root: path.join(__dirname, "../admin-assets"),
    prefix: "/admin/assets/",
    decorateReply: false, // avoid conflict if @fastify/static registered elsewhere
  });

  // Register session
  await fastify.register(secureSession, {
    secret: fastify.config.ADMIN_SESSION_SECRET, // 32+ char string
    salt: "wadsmedia-admin!", // 16 bytes
    cookie: {
      path: "/admin",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 86400, // 24 hours
    },
  });

  // Register routes
  await fastify.register(adminRoutes, { prefix: "/admin" });
}, { name: "admin-dashboard" });
```

### Pattern 2: htmx Partial Responses
**What:** Routes return either full pages (initial load) or HTML fragments (htmx AJAX requests), controlled by the `HX-Request` header
**When to use:** Every dashboard route that htmx targets
**Example:**
```typescript
// Full page vs. partial response
fastify.get("/admin/users", { preHandler: [requireAuth] }, async (request, reply) => {
  const users = getAllUsers(fastify.db);
  const isHtmx = request.headers["hx-request"] === "true";

  if (isHtmx) {
    // Return just the table body fragment
    return reply.viewAsync("partials/user-rows.eta", { users });
  }
  // Return full page with layout
  return reply.viewAsync("pages/users.eta", { users });
});
```

### Pattern 3: Session-Based Auth Guard
**What:** A preHandler hook that checks the encrypted session cookie for admin identity
**When to use:** On all `/admin/*` routes except `/admin/login`
**Example:**
```typescript
async function requireAuth(request, reply) {
  const userId = request.session.get("adminUserId");
  if (!userId) {
    // htmx requests get a redirect header; browser requests get 302
    if (request.headers["hx-request"]) {
      return reply.header("HX-Redirect", "/admin/login").code(200).send();
    }
    return reply.redirect("/admin/login");
  }
}
```

### Pattern 4: Plex User Linking (Schema Extension)
**What:** Add a `plexUserId` column to the `users` table to store the Tautulli/Plex user_id mapping
**When to use:** Phase 12 plan 3 (Plex user linking)
**Example:**
```typescript
// Schema migration: add plexUserId to users table
// In src/db/schema.ts:
plexUserId: integer("plex_user_id"),  // nullable, Tautulli user_id for per-user watch history

// Linking workflow:
// 1. Admin clicks "Link Plex" on a user row
// 2. Dashboard fetches Tautulli users via tautulli.getUsers()
// 3. Admin selects the matching Plex user from dropdown
// 4. Backend stores plexUserId on the users row
// 5. get_watch_history tool uses plexUserId when querying Tautulli
```

### Anti-Patterns to Avoid
- **SPA in disguise:** Don't turn htmx into a JSON API + client-side template engine. Return HTML fragments, not JSON. The server owns all rendering.
- **Unscoped session cookies:** Always set `path: "/admin"` on the session cookie. The existing Twilio webhook must never receive dashboard cookies.
- **Shared @fastify/static instance:** If `@fastify/static` is ever registered elsewhere, use `decorateReply: false` on the second registration to avoid decoration collision.
- **Template files outside Docker image:** The Dockerfile copies `dist/` but templates are `.eta` files (not TypeScript). They must be explicitly `COPY`'d in the Dockerfile.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cookie encryption/signing | Custom crypto for session tokens | `@fastify/secure-session` (libsodium) | Crypto is easy to get wrong; libsodium is audited |
| Template rendering | String concatenation / tagged templates | `@fastify/view` + Eta | XSS escaping, layout support, caching built-in |
| Static file serving | Manual `fs.readFile` in routes | `@fastify/static` | Handles mime types, caching headers, range requests |
| CSRF protection | Custom token generation | htmx sends `HX-Request: true` header (not from forms) | htmx AJAX requests include this header; non-htmx forms are only the login POST |
| Health check aggregation | Polling each service on every request | Cache health status on a timer (e.g., 60s) | Avoids slow dashboard loads when a service is down/timing out |

**Key insight:** The existing codebase already has healthCheck() on Plex and Tautulli clients. Sonarr/Radarr need healthCheck() methods added (call `system/status` endpoint). Don't create a new health infrastructure -- extend what exists.

## Common Pitfalls

### Pitfall 1: Template Files Missing from Docker Image
**What goes wrong:** Dashboard works in dev (`tsx watch`) but returns 500 in production Docker because `.eta` files weren't copied
**Why it happens:** `tsc` compiles `.ts` to `dist/`, but `.eta` files are not TypeScript. The Dockerfile only copies `dist/` and `drizzle/`.
**How to avoid:** Add `COPY src/admin-views/ ./admin-views/` (or `COPY src/admin-assets/ ./admin-assets/`) to the Dockerfile. Point the view engine at a path relative to the working directory, not `__dirname`.
**Warning signs:** Works in dev, fails in Docker with "template not found" or "ENOENT"

### Pitfall 2: @fastify/static Decoration Conflict
**What goes wrong:** `AssertionError: The decorator 'sendFile' has already been added` when registering a second @fastify/static instance
**Why it happens:** @fastify/static decorates `reply` with `sendFile` by default. A second registration (e.g., for admin assets) collides.
**How to avoid:** Pass `decorateReply: false` on the second registration. Or register within a scoped plugin (Fastify plugin encapsulation isolates decorators).
**Warning signs:** Crash on server startup with decorator assertion error

### Pitfall 3: Session Cookie Leaking to Webhook Routes
**What goes wrong:** The Twilio webhook receives an admin session cookie, wasting bytes and potentially confusing auth logic
**Why it happens:** Session cookie `path` defaults to `/` if not explicitly set
**How to avoid:** Set `cookie: { path: "/admin" }` in the secure-session config
**Warning signs:** Session cookie visible in Twilio webhook request headers

### Pitfall 4: htmx Redirect After Session Expiry
**What goes wrong:** User's session expires mid-use, htmx request returns login page HTML which gets swapped into the page body, creating a broken UI
**Why it happens:** htmx swaps response HTML into the target element. A 302 redirect to `/admin/login` returns the login page HTML.
**How to avoid:** Detect `HX-Request` header in the auth guard. For htmx requests, return `HX-Redirect: /admin/login` response header with a 200 status (htmx follows `HX-Redirect` by navigating the full page).
**Warning signs:** Login form appearing inside a table or card container

### Pitfall 5: Health Check Timeouts Blocking Dashboard Load
**What goes wrong:** Dashboard home page takes 15+ seconds to load because it sequentially calls healthCheck() on 4 services, and one is unreachable
**Why it happens:** Each healthCheck() has a 5-10s timeout. 4 services = up to 40s worst case.
**How to avoid:** Run health checks in parallel with `Promise.allSettled()`, or better: cache health status on a background timer (e.g., every 60s) and serve from cache.
**Warning signs:** Dashboard home page is slow when any service is down

### Pitfall 6: Eta Template Path Resolution in Production
**What goes wrong:** Templates found in development but not in production because `__dirname` resolves to `dist/admin/` in compiled output
**Why it happens:** TypeScript compiles to `dist/`, but template files are raw `.eta` files that don't go through compilation
**How to avoid:** Use a path relative to `process.cwd()` (e.g., `path.join(process.cwd(), "admin-views")`) or configure the Dockerfile to place templates at a known absolute path
**Warning signs:** ENOENT errors for template files only in production builds

## Code Examples

Verified patterns from official sources:

### Eta Template with Layout
```html
<!-- admin-views/layouts/main.eta -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WadsMedia Admin</title>
  <script src="/admin/assets/htmx.min.js"></script>
  <link rel="stylesheet" href="/admin/assets/style.css">
</head>
<body>
  <nav><!-- nav links --></nav>
  <main><%~ it.body %></main>
</body>
</html>
```

### @fastify/view + Eta Registration
```typescript
// Source: @fastify/view README + Eta docs
import { Eta } from "eta";
import view from "@fastify/view";
import path from "node:path";

const eta = new Eta({ views: path.join(process.cwd(), "admin-views") });

await fastify.register(view, {
  engine: { eta },
  root: path.join(process.cwd(), "admin-views"),
  viewExt: "eta",
  layout: "layouts/main",
});
```

### @fastify/secure-session with Secret String
```typescript
// Source: @fastify/secure-session README
import secureSession from "@fastify/secure-session";

await fastify.register(secureSession, {
  secret: config.ADMIN_SESSION_SECRET, // min 32 chars, from env var
  salt: "mq9hDxBVDbspDR6n",            // exactly 16 bytes
  cookie: {
    path: "/admin",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 86400,
  },
});

// Login handler
fastify.post("/admin/login", async (request, reply) => {
  // Validate credentials (simple password check)
  request.session.set("adminUserId", user.id);
  return reply.redirect("/admin");
});

// Logout
fastify.post("/admin/logout", async (request, reply) => {
  request.session.delete();
  return reply.redirect("/admin/login");
});
```

### htmx User Table with Inline Edit
```html
<!-- Source: htmx.org/examples/click-to-edit/ -->
<table>
  <thead>
    <tr><th>Name</th><th>Phone</th><th>Admin</th><th>Actions</th></tr>
  </thead>
  <tbody id="user-list">
    <% it.users.forEach(user => { %>
    <tr id="user-<%= user.id %>">
      <td><%= user.displayName || "—" %></td>
      <td><%= user.phone %></td>
      <td><%= user.isAdmin ? "Yes" : "No" %></td>
      <td>
        <button hx-get="/admin/api/users/<%= user.id %>/edit"
                hx-target="#user-<%= user.id %>"
                hx-swap="outerHTML">Edit</button>
      </td>
    </tr>
    <% }) %>
  </tbody>
</table>
```

### htmx Chat History Loading
```html
<!-- Lazy-load chat history when user clicks "View Chat" -->
<div hx-get="/admin/api/users/<%= it.userId %>/messages"
     hx-trigger="revealed"
     hx-swap="innerHTML">
  Loading chat history...
</div>
```

### Health Check Aggregation
```typescript
// System health aggregation for dashboard
async function getSystemHealth(fastify) {
  const [sonarr, radarr, plex, tautulli] = await Promise.allSettled([
    fastify.sonarr?.healthCheck() ?? Promise.resolve(false),
    fastify.radarr?.healthCheck() ?? Promise.resolve(false),
    fastify.plex?.healthCheck() ?? Promise.resolve(false),
    fastify.tautulli?.healthCheck() ?? Promise.resolve(false),
  ]);

  return {
    sonarr: { configured: !!fastify.sonarr, healthy: sonarr.status === "fulfilled" && sonarr.value },
    radarr: { configured: !!fastify.radarr, healthy: radarr.status === "fulfilled" && radarr.value },
    plex: { configured: !!fastify.plex, healthy: plex.status === "fulfilled" && plex.value },
    tautulli: { configured: !!fastify.tautulli, healthy: tautulli.status === "fulfilled" && tautulli.value },
  };
}
```

### Plex User Linking (Tautulli Users Dropdown)
```typescript
// Fetch Tautulli users for linking UI
const tautulliUsers = await fastify.tautulli.getUsers();
// Returns: [{ user_id: 133788, username: "Jon", friendly_name: "Jon Snow", email: "jon@..." }, ...]

// Save link
await db.update(users)
  .set({ plexUserId: selectedTautulliUserId, updatedAt: new Date() })
  .where(eq(users.id, wadsmediaUserId));
```

## Schema Changes Required

### users table: add plexUserId column
```sql
ALTER TABLE users ADD COLUMN plex_user_id INTEGER;
```

This stores the Tautulli/Plex `user_id` (integer) that maps a WadsMedia user to their Plex account. When `get_watch_history` is called, the tool reads `plexUserId` from the user's row and passes it to `tautulli.getHistory({ userId: plexUserId })` for per-user filtering.

### New env vars needed
```
ADMIN_SESSION_SECRET=<min 32 char secret for cookie encryption>
ADMIN_PASSWORD=<password for dashboard login>
```

The session secret encrypts the cookie. The admin password is a simple shared password for dashboard access (prior decision: no OAuth/SSO). Both are validated by Zod in `config.ts` as optional strings (dashboard is optional; without these vars, the admin plugin is not registered).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `reply.view()` (sync callback) | `reply.viewAsync()` (async/await) | @fastify/view v9+ | Always use viewAsync for Eta (it's async-native) |
| fastify-static (old package name) | @fastify/static (scoped) | Fastify v4+ migration | Use scoped package name only |
| htmx 1.x | htmx 2.0 | June 2024 | Some attribute names changed; `hx-on` syntax updated |
| @fastify/secure-session key file | Secret string + salt | Always available | Simpler for Docker/env-var deployments |

**Deprecated/outdated:**
- `fastify-static`, `fastify-secure-session` (unscoped names): Use `@fastify/static`, `@fastify/secure-session`
- `reply.view()` synchronous: Use `reply.viewAsync()` with Eta

## Database Queries Needed (admin.service.ts)

The following queries are needed for the dashboard. None exist in the current codebase:

| Query | Purpose | Notes |
|-------|---------|-------|
| `getAllUsers(db)` | User management list | `SELECT * FROM users ORDER BY createdAt DESC` |
| `getUserById(db, id)` | User detail / edit | `SELECT * FROM users WHERE id = ?` |
| `updateUser(db, id, fields)` | Edit user (name, admin toggle) | Partial update on users table |
| `deleteUser(db, id)` | Remove user | CASCADE delete messages + media_tracking? Or soft-delete? |
| `getUserMessages(db, userId, opts)` | Chat history viewer | `SELECT * FROM messages WHERE userId = ? ORDER BY createdAt ASC` with pagination |
| `getMediaTrackingStats(db)` | Dashboard stats | Aggregate counts from media_tracking (total, last 7 days, by user) |
| `getRecentMediaAdditions(db, limit)` | Dashboard recent activity | `SELECT * FROM media_tracking ORDER BY addedAt DESC LIMIT ?` joined with users for display name |
| `setPlexUserId(db, userId, plexUserId)` | Plex linking | `UPDATE users SET plex_user_id = ? WHERE id = ?` |

## Sonarr/Radarr Health Check Gap

The existing Plex and Tautulli clients have `healthCheck(): Promise<boolean>` methods. The Sonarr and Radarr clients do **not**. The Sonarr/Radarr v3 API provides a `system/status` endpoint that returns server version info if the API key is valid.

**Action required in Plan 12-01:** Add `healthCheck()` methods to `SonarrClient` and `RadarrClient`:
```typescript
async healthCheck(): Promise<boolean> {
  try {
    await this.request("system/status", z.object({}).passthrough(), { timeoutMs: 5_000 });
    return true;
  } catch {
    return false;
  }
}
```

## Dockerfile Changes Required

The current Dockerfile does not copy template files. Phase 12 must add:
```dockerfile
# After existing COPY lines in production stage:
COPY src/admin-views/ ./admin-views/
COPY src/admin-assets/ ./admin-assets/
```

And the view engine must resolve paths relative to `process.cwd()`, not `__dirname` (which would resolve to `dist/admin/` in compiled output).

## Open Questions

1. **User deletion behavior**
   - What we know: Users have related messages and media_tracking records via foreign keys
   - What's unclear: Should user deletion CASCADE (delete all history) or soft-delete (mark status as "blocked")?
   - Recommendation: Default to soft-delete (set status to "blocked") to preserve audit trail. Add a "hard delete" option behind confirmation.

2. **Admin password vs. per-admin credentials**
   - What we know: Prior decision says "simple auth, no OAuth/SSO". There can be multiple admin users (isAdmin flag).
   - What's unclear: Is it one shared ADMIN_PASSWORD, or does each admin have their own password?
   - Recommendation: Start with a single shared `ADMIN_PASSWORD` env var. The session stores which admin user is logged in (by phone number / user ID). Phase 12 success criteria only requires "admin can log in" -- per-admin passwords can be added later if needed.

3. **Chat history message rendering**
   - What we know: Messages have role (user/assistant/tool/system), content, toolCalls (JSON), toolCallId
   - What's unclear: How to render tool call messages (they contain JSON function arguments and results)
   - Recommendation: Show user and assistant messages as chat bubbles. Collapse tool call sequences into an expandable "Tool: search_movies({...})" summary. Don't try to render the full tool call JSON by default.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/db/schema.ts`, `src/users/user.service.ts`, `src/conversation/history.ts`, `src/media/plex/plex.client.ts`, `src/media/tautulli/tautulli.client.ts` -- direct examination of existing code patterns
- `src/server.ts`, `src/plugins/*.ts` -- Fastify plugin registration patterns
- `src/config.ts` -- Zod env var validation pattern
- `Dockerfile` -- current build/copy structure

### Secondary (MEDIUM confidence)
- [@fastify/view npm](https://www.npmjs.com/package/@fastify/view) -- v11.1.1, template rendering with Eta support
- [@fastify/static npm](https://www.npmjs.com/package/@fastify/static) -- v9.0.0, static file serving
- [@fastify/secure-session GitHub](https://github.com/fastify/fastify-secure-session) -- v8.3.0, stateless cookie session with secret string
- [Eta docs](https://eta.js.org/) -- v4.5.1, lightweight TS-native template engine
- [htmx docs](https://htmx.org/docs/) -- v2.0.8, hypermedia-driven interactions
- [htmx click-to-edit example](https://htmx.org/examples/click-to-edit/) -- inline edit pattern
- [htmx active search example](https://htmx.org/examples/active-search/) -- search pattern
- [Tautulli API Reference](https://github.com/Tautulli/Tautulli/wiki/Tautulli-API-Reference) -- get_users returns user_id, username, friendly_name, email

### Tertiary (LOW confidence)
- Sonarr/Radarr `system/status` endpoint for health checks -- based on general knowledge of Sonarr/Radarr v3 API, not verified against current version

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries are official Fastify plugins or well-established (Eta, htmx), verified via npm
- Architecture: HIGH -- patterns follow established Fastify plugin encapsulation and htmx official examples
- Pitfalls: HIGH -- identified from direct codebase analysis (Dockerfile gaps, missing healthCheck methods, session scoping)
- Schema changes: HIGH -- directly analyzed existing schema.ts; plexUserId addition is straightforward
- Sonarr/Radarr health endpoint: LOW -- `system/status` assumed from general API knowledge, needs verification

**Research date:** 2026-02-14
**Valid until:** 2026-03-14 (30 days -- stable libraries, no fast-moving concerns)

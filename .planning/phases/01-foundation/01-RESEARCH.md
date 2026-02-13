# Phase 1: Foundation - Research

**Researched:** 2026-02-13
**Domain:** Node.js/TypeScript project scaffolding, Docker containerization, SQLite database, structured logging, configuration validation
**Confidence:** HIGH (versions verified via npm registry, patterns verified via official documentation)

## Summary

Phase 1 establishes the application skeleton: a Fastify HTTP server running in a Docker container with structured Pino logging, Zod-validated environment configuration, SQLite persistence via Drizzle ORM, and a health check endpoint. All technologies are well-established with stable APIs. The primary complexity is getting ESM + TypeScript + native addon (better-sqlite3) + Docker multi-stage builds to work together correctly -- a combination with well-documented but easy-to-miss configuration details.

The stack is straightforward: Fastify 5 ships with Pino as its default logger, Drizzle ORM has first-class better-sqlite3 support, and Zod is the community standard for TypeScript validation. The main risk is ESM configuration -- Node.js 22 with `"type": "module"`, TypeScript `moduleResolution: "nodenext"`, and requiring `.js` extensions in imports. Getting this right at scaffolding time prevents painful debugging later.

**Primary recommendation:** Scaffold the project with strict ESM configuration from the start (`"type": "module"` in package.json, `moduleResolution: "nodenext"` in tsconfig.json), use `@tsconfig/node22` as the base TypeScript config, and set up the Docker multi-stage build with build tools in the first stage to handle better-sqlite3 native compilation.

## Standard Stack

### Core (Verified Versions)

| Library | Version | Purpose | Why Standard | Confidence |
|---------|---------|---------|--------------|------------|
| Node.js | 22 LTS | Runtime | LTS since Oct 2024, native fetch, stable ESM support. Docker base: `node:22-slim` | HIGH |
| TypeScript | ~5.9 | Type safety | Current stable. Strict mode catches integration bugs at compile time. | HIGH (npm: 5.9.3) |
| Fastify | ~5.7 | HTTP framework | Built-in Pino logger, plugin architecture, excellent TypeScript support, JSON schema validation | HIGH (npm: 5.7.4) |
| better-sqlite3 | ~12.6 | SQLite driver | Synchronous API (no callback overhead), fastest Node.js SQLite driver, native bindings | HIGH (npm: 12.6.2) |
| drizzle-orm | ~0.45 | ORM/query builder | Lightweight, type-safe SQL, schema-as-TypeScript, no code generation step, excellent SQLite support | HIGH (npm: 0.45.1) |
| drizzle-kit | ~0.31 | Migration tooling | Generates SQL migration files from schema changes, CLI + programmatic API | HIGH (npm: 0.31.9) |
| Zod | ~4.3 | Runtime validation | TypeScript-first schema validation for env vars, webhook payloads, API responses | HIGH (npm: 4.3.6) |
| Pino | ~10.3 | Structured logging | Fastify's built-in logger, JSON output by default, fast and low-overhead | HIGH (npm: 10.3.1) |

**IMPORTANT VERSION NOTE:** Zod has jumped to v4.x (4.3.6) and Pino to v10.x (10.3.1) -- significantly newer than the project-level STACK.md estimates of ~3.24 and ~9.6. drizzle-orm is at 0.45.1, not ~0.38. These are the current npm versions as of 2026-02-13.

### Supporting

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| fastify-plugin | ~5.1 | Plugin helper | Wrap all Fastify plugins to break encapsulation correctly | HIGH (npm: 5.1.0) |
| pino-pretty | ~13.1 | Dev log formatting | Development only -- human-readable log output instead of JSON | HIGH (npm: 13.1.3) |
| tsx | ~4.21 | Dev TypeScript runner | Development only -- runs TS directly without build step | HIGH (npm: 4.21.0) |
| @tsconfig/node22 | ~22.0 | Base tsconfig | Extends for project-specific settings | HIGH (npm: 22.0.5) |
| @types/better-sqlite3 | ~7.6 | Type declarations | TypeScript types for better-sqlite3 | HIGH (npm: 7.6.13) |
| @types/node | ~25.2 | Node.js types | TypeScript types for Node.js APIs | HIGH (npm: 25.2.3) |
| @biomejs/biome | ~2.3 | Lint + format | Single tool replacing ESLint + Prettier. Over 423 rules, type-aware linting in v2+ | HIGH (npm: 2.3.15) |
| vitest | ~4.0 | Testing | Fast, TypeScript-native, ESM-first testing framework | HIGH (npm: 4.0.18) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fastify | Express | Express lacks built-in schema validation, no default structured logging, weaker TypeScript support. Fastify's plugin system is a better fit for modular architecture. |
| better-sqlite3 | Node 22 built-in `node:sqlite` | Node's built-in SQLite module is experimental (stability: 1.1). better-sqlite3 is production-proven with synchronous API and better performance. |
| Drizzle ORM | Prisma | Prisma requires code generation, produces large client, heavier Docker images. Drizzle is lighter and more SQL-transparent. |
| Drizzle ORM | Raw SQL | Loses type safety. Drizzle adds minimal overhead while providing typed queries. |
| Biome | ESLint + Prettier | Two tools, multiple config files, plugin compatibility. Biome does both in one tool, 10-100x faster. |
| Vitest | Jest | Jest's ESM support still requires config gymnastics. Vitest is ESM-native. Same API. |

**Installation:**
```bash
# Core dependencies
npm install fastify better-sqlite3 drizzle-orm zod pino

# Dev dependencies
npm install -D typescript tsx vitest @biomejs/biome drizzle-kit pino-pretty fastify-plugin @tsconfig/node22 @types/better-sqlite3 @types/node
```

## Architecture Patterns

### Recommended Project Structure

```
src/
  index.ts                  # Entry point: create Fastify server, register plugins, start
  config.ts                 # Zod schema for env vars, validated config export
  server.ts                 # Fastify instance factory (buildServer function)
  db/
    schema.ts               # Drizzle table definitions (SQLite)
    index.ts                # Database connection + Drizzle instance
  plugins/
    database.ts             # Fastify plugin: registers db on instance
    health.ts               # Fastify plugin: GET /health endpoint
drizzle/                    # Generated migration SQL files (by drizzle-kit)
drizzle.config.ts           # Drizzle Kit configuration
tsconfig.json               # TypeScript config (extends @tsconfig/node22)
biome.json                  # Biome linter/formatter config
package.json                # type: "module", scripts, dependencies
Dockerfile                  # Multi-stage build
docker-compose.yml          # Development + deployment orchestration
.env.example                # Documented environment variables
```

### Pattern 1: Zod Environment Variable Validation

**What:** Define a Zod schema for all environment variables. Parse `process.env` against it at startup. If validation fails, log the specific errors and exit immediately. Export the typed config object for use throughout the app.

**When to use:** Always -- this is the first thing that runs on application startup.

**Example:**
```typescript
// src/config.ts
// Source: https://www.creatures.sh/blog/env-type-safety-and-validation/
import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),

  // Database
  DATABASE_PATH: z.string().default('/data/wadsmedia.db'),

  // Twilio (optional in Phase 1, required starting Phase 2)
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_PHONE_NUMBER: z.string().min(1).optional(),

  // LLM (optional in Phase 1, required starting Phase 5)
  LLM_API_KEY: z.string().min(1).optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_MODEL: z.string().default('gpt-4o'),

  // Sonarr/Radarr (optional in Phase 1, required starting Phase 4)
  SONARR_URL: z.string().url().optional(),
  SONARR_API_KEY: z.string().min(1).optional(),
  RADARR_URL: z.string().url().optional(),
  RADARR_API_KEY: z.string().min(1).optional(),

  // Users (optional in Phase 1, required starting Phase 3)
  PHONE_WHITELIST: z.string().transform(val => val.split(',')).pipe(z.array(z.string().min(1))).optional(),
  ADMIN_PHONE: z.string().min(1).optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment configuration:');
    // Zod v4: error.issues (not error.errors)
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}
```

**IMPORTANT Zod v4 change:** In Zod v4, error messages for missing required fields changed from "Required" to "expected {type}, received undefined". Error objects use `.issues` (not `.errors`). The `.transform()` function runs even if a preceding `.refine()` fails -- be cautious when chaining transforms with refinements.

### Pattern 2: Fastify Plugin for Database Registration

**What:** Wrap database initialization in a Fastify plugin using `fastify-plugin`. This registers the Drizzle database instance as a decorator on the Fastify instance, making it available to all routes and plugins. Run migrations on startup before the server starts listening.

**When to use:** Database setup during application bootstrap.

**Example:**
```typescript
// src/plugins/database.ts
// Source: https://fastify.dev/docs/latest/Reference/Plugins/
import fp from 'fastify-plugin';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import * as schema from '../db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

declare module 'fastify' {
  interface FastifyInstance {
    db: ReturnType<typeof drizzle>;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const sqlite = new Database(fastify.config.DATABASE_PATH);

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma('journal_mode = WAL');
  // Safe with WAL mode, improves write performance
  sqlite.pragma('synchronous = normal');
  // Enable foreign key enforcement
  sqlite.pragma('foreign_keys = ON');
  // Wait 5s for locks instead of immediately failing
  sqlite.pragma('busy_timeout = 5000');

  const db = drizzle(sqlite, { schema });

  // Run pending migrations on startup
  // Path resolved relative to compiled output location
  const migrationsFolder = path.join(__dirname, '../../drizzle');
  migrate(db, { migrationsFolder });

  fastify.log.info('Database connected and migrations applied');

  fastify.decorate('db', db);

  // Graceful shutdown: close database on server close
  fastify.addHook('onClose', () => {
    fastify.log.info('Closing database connection');
    sqlite.close();
  });
}, { name: 'database' });
```

### Pattern 3: Fastify Server Factory

**What:** Create a `buildServer()` factory function that constructs and configures the Fastify instance. This allows tests to create isolated server instances without starting the actual server.

**When to use:** Always -- this is the standard Fastify testing pattern.

**Example:**
```typescript
// src/server.ts
// Source: https://fastify.dev/docs/latest/Guides/Getting-Started/
import Fastify from 'fastify';
import type { AppConfig } from './config.js';
import databasePlugin from './plugins/database.js';
import healthPlugin from './plugins/health.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }
}

export async function buildServer(config: AppConfig) {
  const fastify = Fastify({
    logger: config.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        }
      : true, // JSON output in production
  });

  // Make config available to plugins via decorator
  fastify.decorate('config', config);

  // Register plugins
  await fastify.register(databasePlugin);
  await fastify.register(healthPlugin);

  return fastify;
}
```

```typescript
// src/index.ts
import { loadConfig } from './config.js';
import { buildServer } from './server.js';

const config = loadConfig();
const server = await buildServer(config);

try {
  await server.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
```

### Pattern 4: Health Check Endpoint

**What:** A simple GET /health endpoint that returns application status. For Phase 1, it checks that the server is running and the database is accessible. Later phases can add checks for Sonarr/Radarr connectivity, Twilio status, etc.

**When to use:** Always -- Docker HEALTHCHECK depends on this.

**Example:**
```typescript
// src/plugins/health.ts
// Source: https://fastify.dev/docs/latest/Reference/Plugins/
import fp from 'fastify-plugin';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

export default fp(async (fastify: FastifyInstance) => {
  fastify.get('/health', async (request, reply) => {
    let dbStatus = 'ok';
    try {
      fastify.db.run(sql`SELECT 1`);
    } catch {
      dbStatus = 'error';
    }

    const status = dbStatus === 'ok' ? 'ok' : 'degraded';
    const statusCode = status === 'ok' ? 200 : 503;

    return reply.code(statusCode).send({
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database: dbStatus,
      },
    });
  });
}, { name: 'health' });
```

### Pattern 5: Drizzle Schema Definition

**What:** Define database tables using Drizzle's TypeScript-native schema API. For Phase 1, create a minimal initial migration -- even just a settings or metadata table. The real schema (users, conversations, messages) comes in later phases, but the migration infrastructure must work from day one.

**Example:**
```typescript
// src/db/schema.ts
// Source: https://orm.drizzle.team/docs/get-started-sqlite
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Phase 1: Minimal schema to prove migrations work
// Real tables (users, conversations, messages) added in later phases
export const appMetadata = sqliteTable('app_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});
```

```typescript
// drizzle.config.ts
// Source: https://orm.drizzle.team/docs/drizzle-config-file
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_PATH || './data/wadsmedia.db',
  },
});
```

### Anti-Patterns to Avoid

- **CommonJS in an ESM project:** Do NOT use `require()` or `module.exports`. The project uses `"type": "module"` -- everything must use `import`/`export`. Mixing CJS and ESM creates subtle runtime bugs.
- **Skipping `.js` extensions in imports:** With `moduleResolution: "nodenext"`, TypeScript requires `.js` extensions on relative imports (`import { loadConfig } from './config.js'`), even though the source file is `.ts`. This is NOT optional.
- **Using `dotenv` in production:** Docker provides env vars natively. Only use dotenv in development, and even then, consider `--env-file` in your npm scripts instead.
- **Placing SQLite database inside the container filesystem:** The database file MUST be on a Docker volume mount (`/data/`). Without this, data is lost on container restart.
- **Forgetting WAL mode:** SQLite's default journal mode locks the entire database during writes. WAL mode allows concurrent readers during writes. Set it immediately after opening the connection.
- **Using `alpine` base images with better-sqlite3:** Alpine uses musl libc, which can cause subtle issues with native addons. Use `node:22-slim` (Debian-based) for reliable better-sqlite3 compilation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Environment validation | Custom env parsing with `process.env` checks | Zod schema + `safeParse` | 20+ edge cases (type coercion, defaults, missing vs empty, array splitting). Zod handles all of them with type inference. |
| Database migrations | Manual SQL scripts or version tracking | Drizzle Kit `generate` + `migrate` | Migration ordering, conflict detection, rollback tracking, snapshot comparison. All handled by drizzle-kit. |
| Structured logging | `console.log` with JSON.stringify | Pino (via Fastify's built-in logger) | Log levels, serializers, redaction, child loggers with context, fast async writing. |
| HTTP server | Raw `node:http` module | Fastify | Content negotiation, error handling, lifecycle hooks, plugin system, schema validation. |
| Health check | Bare route that returns 200 | Structured response with component status | Docker needs a meaningful health check -- just "200 OK" does not tell you if the database is broken. |

**Key insight:** Phase 1 is infrastructure plumbing. Every component has a well-tested library solution. Custom implementations here create technical debt that compounds in every subsequent phase.

## Common Pitfalls

### Pitfall 1: ESM Import Extension Hell

**What goes wrong:** TypeScript compiles `.ts` files to `.js`, but if your source imports use `import { x } from './module'` (no extension), the compiled output still has no extension, and Node.js ESM resolution fails at runtime with `ERR_MODULE_NOT_FOUND`.

**Why it happens:** Developers coming from CommonJS or bundler-based projects are used to extensionless imports. TypeScript with `moduleResolution: "nodenext"` enforces that you write the OUTPUT extension (`.js`) in the SOURCE file.

**How to avoid:** Always use `.js` extensions in imports, even in `.ts` files:
```typescript
// CORRECT
import { loadConfig } from './config.js';
import { buildServer } from './server.js';

// WRONG - will fail at runtime
import { loadConfig } from './config';
import { loadConfig } from './config.ts';
```

**Warning signs:** `Error [ERR_MODULE_NOT_FOUND]` at runtime. Application compiles fine but crashes on startup.

### Pitfall 2: better-sqlite3 Native Addon Docker Build Failure

**What goes wrong:** `npm install` fails in the Docker build stage because better-sqlite3 requires native compilation (C++, Python, make), and `node:22-slim` does not include build tools by default.

**Why it happens:** `node:22-slim` is a minimal image that strips build tools to reduce size. better-sqlite3 uses `node-gyp` which needs Python 3, a C++ compiler, and `make`.

**How to avoid:** Install build tools in the builder stage of your multi-stage Dockerfile:
```dockerfile
FROM node:22-slim AS builder
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
# ... rest of build
```
The production stage does NOT need build tools -- only the compiled `.node` binary.

**Warning signs:** `node-gyp` errors during Docker build, `Cannot find module 'better-sqlite3'` at runtime.

### Pitfall 3: SQLite File Path Not on Docker Volume

**What goes wrong:** The SQLite database file is created inside the container's ephemeral filesystem. On container restart, all data is lost.

**Why it happens:** The default working directory (`/app`) is inside the container. If the database path is relative (e.g., `./wadsmedia.db`), it writes to the container filesystem, not the volume.

**How to avoid:** Use an absolute path pointing to the volume mount:
```yaml
# docker-compose.yml
services:
  wadsmedia:
    volumes:
      - wadsmedia-data:/data
    environment:
      DATABASE_PATH: /data/wadsmedia.db

volumes:
  wadsmedia-data:
```
Validate the `DATABASE_PATH` env var to ensure it starts with `/data/` in production.

**Warning signs:** Data disappears after `docker compose down && docker compose up`. Database file shows 0 rows after restart.

### Pitfall 4: Drizzle Migration Path Mismatch

**What goes wrong:** Migrations are generated into `./drizzle/` relative to the project root, but the runtime `migrate()` call looks for them in a different path (especially inside Docker where the working directory differs).

**Why it happens:** `drizzle.config.ts` specifies `out: './drizzle'` relative to project root. But in the Docker container, the compiled JS is in `/app/dist/` and the migration folder may not be at the expected relative path.

**How to avoid:** Copy the `drizzle/` migrations folder into the Docker image alongside the compiled code. Use an absolute or well-defined relative path:
```dockerfile
# In Dockerfile production stage
COPY --from=builder /app/drizzle ./drizzle
```
And in the migration call, use `path.join` to resolve from `import.meta.url`:
```typescript
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
```

**Warning signs:** `ENOENT: no such file or directory` errors pointing to migrations folder. App works in development but fails in Docker.

### Pitfall 5: Forgetting Fastify Plugin Encapsulation

**What goes wrong:** You register a decorator (like `db`) inside a plugin, but it is not accessible in other plugins or routes because Fastify's default encapsulation scopes it to that plugin only.

**Why it happens:** Fastify creates a new scope for each `register()` call. Decorators added inside a scope are only visible to that scope and its children, not siblings or parents.

**How to avoid:** Wrap infrastructure plugins with `fastify-plugin` (the `fp()` function). This breaks encapsulation and makes the decorator available to the parent scope:
```typescript
import fp from 'fastify-plugin';
// This decorator will be available globally
export default fp(async (fastify) => {
  fastify.decorate('db', db);
});
```

**Warning signs:** `TypeError: Cannot read properties of undefined (reading 'db')` in route handlers. Plugin works in isolation but fails when composed.

### Pitfall 6: Zod v4 Breaking Changes from v3 Examples

**What goes wrong:** Tutorials and examples reference Zod v3 patterns that behave differently or break in Zod v4. The project-level STACK.md references Zod ~3.24 but npm installs 4.3.6.

**Why it happens:** Zod v4 was a major release with several breaking changes. Many online examples and tutorials still target v3.

**How to avoid:** Use Zod v4 (the current version). Key breaking changes to watch for:
- **Error messages:** Missing required fields now say "expected {type}, received undefined" instead of "Required"
- **Error structure:** Use `error.issues` (not `error.errors`). The `ZodError` shape changed.
- **Transform + refine ordering:** `.transform()` runs even if a preceding `.refine()` fails in v4. This can cause runtime errors if the transform assumes valid data. Place `.refine()` AFTER `.transform()`, or use `.superRefine()`.
- **Optional properties with defaults:** Object properties with `.catch()` or `.default()` that are also `.optional()` now always return the caught/default values even when the property is absent from input.
- **Import path:** Import from `'zod'` (same as v3). The `z` namespace export is unchanged.
- **safeParse params:** The `path` parameter in `parse`/`safeParse` is removed in v4.

**Source:** [Zod v4 Changelog / Migration Guide](https://zod.dev/v4/changelog)

**Warning signs:** TypeScript type errors when following Zod v3 examples. Error formatting looks different than expected. Transform callbacks receive unexpected undefined values.

## Code Examples

### Complete tsconfig.json

```json
{
  "extends": "@tsconfig/node22/tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "drizzle"]
}
```

**Note on @tsconfig/node22 base:** The base config sets `module: "nodenext"`, `target: "es2022"`, `moduleResolution: "node16"`, `lib: ["es2024"]`, `strict: true`, `esModuleInterop: true`, `skipLibCheck: true`. Source: [tsconfig/bases node22.json](https://github.com/tsconfig/bases/blob/main/bases/node22.json)

### Complete package.json (skeleton)

```json
{
  "name": "wadsmedia",
  "version": "0.1.0",
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "check": "biome check .",
    "check:fix": "biome check --write .",
    "test": "vitest",
    "test:run": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

### Complete biome.json

```json
{
  "$schema": "https://biomejs.dev/schemas/2.3.15/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "files": {
    "ignore": ["dist/", "drizzle/", "node_modules/"]
  }
}
```

### Complete Dockerfile (Multi-Stage)

```dockerfile
# Build stage: includes native compilation tools for better-sqlite3
FROM node:22-slim AS builder

RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Production stage: minimal runtime image
FROM node:22-slim

WORKDIR /app

# Copy compiled JS and node_modules (includes native better-sqlite3 binary)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Copy Drizzle migration files
COPY drizzle/ ./drizzle/

ENV NODE_ENV=production
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
```

### Complete docker-compose.yml

```yaml
services:
  wadsmedia:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - wadsmedia-data:/data
    env_file:
      - .env
    environment:
      NODE_ENV: production
      DATABASE_PATH: /data/wadsmedia.db
    restart: unless-stopped

volumes:
  wadsmedia-data:
```

### Pino Logger Configuration (Development vs Production)

```typescript
// Source: https://fastify.dev/docs/latest/Reference/Logging/
// Development: human-readable output
const devLoggerConfig = {
  transport: {
    target: 'pino-pretty',
    options: {
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  },
};

// Production: structured JSON (Pino's default)
const prodLoggerConfig = true; // Fastify enables Pino with defaults

// In Fastify construction:
const fastify = Fastify({
  logger: config.NODE_ENV === 'development' ? devLoggerConfig : prodLoggerConfig,
});
```

### Database Connection with WAL Mode

```typescript
// Source: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

const sqlite = new Database(databasePath);

// Performance pragmas -- order matters
sqlite.pragma('journal_mode = WAL');       // Concurrent readers during writes
sqlite.pragma('synchronous = normal');      // Safe with WAL, better write perf
sqlite.pragma('foreign_keys = ON');         // Enforce foreign key constraints
sqlite.pragma('busy_timeout = 5000');       // Wait 5s for locks instead of failing

const db = drizzle(sqlite, { schema });

// Run migrations synchronously on startup
migrate(db, { migrationsFolder: migrationsPath });
```

### .env.example

```bash
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Database (path inside Docker volume)
DATABASE_PATH=/data/wadsmedia.db

# Twilio (required for Phase 2+)
# TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# TWILIO_PHONE_NUMBER=+1234567890

# LLM (required for Phase 5+)
# LLM_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
# LLM_BASE_URL=https://api.openai.com/v1
# LLM_MODEL=gpt-4o

# Sonarr (required for Phase 4+)
# SONARR_URL=http://sonarr:8989
# SONARR_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Radarr (required for Phase 4+)
# RADARR_URL=http://radarr:7878
# RADARR_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Users (required for Phase 3+)
# PHONE_WHITELIST=+1234567890,+0987654321
# ADMIN_PHONE=+1234567890
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Zod v3.x | Zod v4.x (4.3.6) | 2025 | New error formatting API, updated transform/pipe behavior. Use v4. |
| Pino v9.x | Pino v10.x (10.3.1) | 2025 | Check for any breaking changes in transport config. |
| Drizzle ORM 0.3x | Drizzle ORM 0.45.x | 2025 | Drizzle config uses `dialect: "sqlite"` (not `driver: "better-sqlite"`). Migration import path is `drizzle-orm/better-sqlite3/migrator`. |
| `moduleResolution: "bundler"` | `moduleResolution: "nodenext"` | 2024+ | For ESM Node.js apps, `nodenext` is correct. `bundler` is for frontend toolchains only. |
| ESLint + Prettier | Biome v2.x (2.3.15) | 2025 | Biome v2 added type-aware linting and plugins. Single config file. |
| `ts-node` | `tsx` (4.21.0) | 2024+ | tsx is faster (esbuild-powered), no config needed, better ESM support. |
| Vitest v2.x | Vitest v4.x (4.0.18) | 2025-2026 | Check for config format changes from v2 to v4. |

**Deprecated/outdated:**
- `ts-node`: Replaced by `tsx` for development. Has persistent ESM compatibility issues.
- `dotenv`: Unnecessary with Docker's `--env-file` and `env_file:` in compose. Only useful for bare-metal dev.
- `driver: "better-sqlite"` in drizzle.config.ts: Replaced by `dialect: "sqlite"` in newer drizzle-kit versions.
- Zod v3: Superseded by v4. Do not pin to 3.x.

## Open Questions

1. **Zod v4 API Compatibility**
   - What we know: Zod is at v4.3.6, a major version jump from the v3.24 in STACK.md. Key breaking changes documented in [migration guide](https://zod.dev/v4/changelog).
   - What's unclear: Whether all v3-style patterns in code examples above work identically in v4 (particularly `z.coerce`, `.transform().pipe()` chains)
   - Recommendation: Use v4. Test the env validation pattern early in Plan 01-01 scaffolding. LOW risk since we are starting fresh.

2. **Vitest v4 Configuration**
   - What we know: Vitest is at v4.0.18, up from v2.x estimated in STACK.md
   - What's unclear: Whether vitest.config.ts format changed significantly between v2 and v4
   - Recommendation: Use `defineConfig` from `vitest/config` with minimal config. Vitest v4 should be largely compatible.

3. **Drizzle ORM Programmatic Migration with ESM**
   - What we know: `migrate()` from `drizzle-orm/better-sqlite3/migrator` accepts `{ migrationsFolder }` parameter
   - What's unclear: Whether the migration path resolution works correctly with ESM `import.meta.url` in Docker
   - Recommendation: Use `path.join` with `import.meta.url`-derived `__dirname` for reliable path resolution across dev and Docker environments. Test this in Plan 01-03 (Docker packaging).

4. **Phase 1 Config Scope**
   - What we know: Phase 1 requires env var validation. The full app needs many env vars (Twilio, LLM, Sonarr, Radarr).
   - What's unclear: Should Phase 1 validate ALL vars or just foundation-level ones?
   - Recommendation: Define the full schema but make non-foundation vars `.optional()`. Phase 1 only needs PORT, HOST, NODE_ENV, DATABASE_PATH. Later phases tighten constraints when they register their features. This prevents Phase 1 from requiring Twilio/LLM/Sonarr keys just to start.

5. **Pino v10 + Fastify 5 Compatibility**
   - What we know: Pino is at v10.3.1. Fastify 5 ships with Pino built in.
   - What's unclear: Whether Fastify 5.7.4 bundles Pino v10 internally or v9. If it bundles v9 internally, installing Pino v10 separately could cause conflicts.
   - Recommendation: Do NOT install Pino as a direct dependency initially. Let Fastify manage its own Pino version. Only install `pino-pretty` as a dev dependency. If custom Pino configuration is needed beyond what Fastify's `logger` option provides, then check `npm ls pino` to see which version Fastify uses.

## Sources

### Primary (HIGH confidence)
- npm registry (live queries 2026-02-13) -- all version numbers verified
- [Fastify TypeScript docs](https://fastify.dev/docs/latest/Reference/TypeScript/) -- ESM setup, type providers, plugin typing
- [Fastify Logging docs](https://fastify.dev/docs/latest/Reference/Logging/) -- Pino integration, transport config
- [Fastify Plugins docs](https://fastify.dev/docs/latest/Reference/Plugins/) -- encapsulation, fastify-plugin usage
- [Drizzle ORM SQLite setup](https://orm.drizzle.team/docs/get-started-sqlite) -- connection, schema, installation
- [Drizzle config reference](https://orm.drizzle.team/docs/drizzle-config-file) -- drizzle.config.ts format
- [Drizzle Migrations docs](https://orm.drizzle.team/docs/migrations) -- generate, migrate, push workflows
- [@tsconfig/node22](https://github.com/tsconfig/bases/blob/main/bases/node22.json) -- base TypeScript config
- [Zod v4 Migration Guide](https://zod.dev/v4/changelog) -- breaking changes from v3

### Secondary (MEDIUM confidence)
- [better-sqlite3 Docker discussion](https://github.com/WiseLibs/better-sqlite3/discussions/1270) -- Alpine vs slim, build dependencies
- [better-sqlite3 performance docs](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md) -- WAL mode, pragma settings
- [Zod env validation pattern](https://www.creatures.sh/blog/env-type-safety-and-validation/) -- safeParse pattern for process.env
- [Biome official site](https://biomejs.dev/) -- v2.x features, configuration format
- [tsx documentation](https://tsx.is/) -- development runner, ESM support
- [fastify-healthcheck plugin](https://github.com/smartiniOnGitHub/fastify-healthcheck) -- health check patterns

### Tertiary (LOW confidence)
- Pino v10 + Fastify 5 compatibility: Not verified whether Fastify 5.7 bundles Pino v9 or v10 internally. Check `npm ls pino` after install.
- Vitest v4 config compatibility: Not fully verified. May have breaking changes from v2.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all versions verified via npm registry, patterns from official docs
- Architecture: HIGH -- Fastify plugin system, Drizzle migration pattern, Zod validation are well-documented
- Pitfalls: HIGH -- ESM extensions, native addon Docker builds, volume mounts are well-known issues with verified solutions

**Research date:** 2026-02-13
**Valid until:** 2026-03-15 (30 days -- stable technologies, unlikely to change)

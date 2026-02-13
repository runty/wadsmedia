# Stack Research

**Domain:** Conversational messaging gateway (chatbot bridging messaging providers to media server APIs)
**Researched:** 2026-02-13
**Confidence:** MEDIUM (versions from training data through May 2025; live verification was unavailable -- all version numbers should be validated with `npm view <pkg> version` before use)

## Version Verification Note

WebSearch, WebFetch, and Bash tools were unavailable during this research. All version numbers are from training data (cutoff: May 2025) and are flagged as **needing validation**. Before starting development, run:

```bash
npm view twilio openai better-sqlite3 fastify typescript zod pino vitest tsx drizzle-orm version
```

The architectural recommendations and library choices themselves are HIGH confidence -- these are well-established ecosystem standards. Only the exact version pins may be stale.

---

## Recommended Stack

### Runtime & Language

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Node.js | 22 LTS | Runtime | Long-term support, native fetch, built-in test runner as backup, performance improvements. Docker base image: `node:22-slim`. Node 22 entered LTS in October 2024. | HIGH (LTS cycle is predictable) |
| TypeScript | ~5.7 | Type safety | Essential for a multi-provider architecture with interfaces. Strict mode catches integration bugs at compile time rather than runtime. | MEDIUM (version may be 5.8+) |
| tsx | ~4.19 | Dev runner | Runs TypeScript directly without build step during development. Faster iteration than `ts-node`. Uses esbuild under the hood. | MEDIUM (version may differ) |

### HTTP Server

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Fastify | ~5.2 | HTTP framework | Handles Twilio webhooks. Fastify over Express because: (1) built-in JSON schema validation for webhook payloads, (2) structured plugin system maps naturally to modular providers, (3) better TypeScript support with generic typing, (4) significantly faster request handling for webhook throughput. Express is fine but Fastify's plugin architecture is a better fit for a modular provider system. | MEDIUM (version may differ) |

### Messaging Provider

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| twilio | ~5.4 | Twilio SDK | Official Node.js SDK. Handles RCS message sending, webhook signature validation, and message status callbacks. RCS is sent through the same Messages API as SMS -- you set the channel in the request. The SDK provides `validateRequest()` for webhook security. | MEDIUM (version may be 5.x+) |

### LLM Integration

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| openai | ~4.73 | LLM client | The `openai` npm package is the de facto standard for any OpenAI-compatible API. Works with OpenAI, Anthropic (via compatible proxy), Ollama, LM Studio, vLLM, and any provider implementing the OpenAI chat completions spec. Set `baseURL` to point at any provider. Supports function/tool calling natively, which is how intent parsing should work. | MEDIUM (version likely 4.x, may be higher) |

### Database & ORM

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| better-sqlite3 | ~11.7 | Database engine | SQLite is the right choice here, not PostgreSQL. Reasons: (1) single-container deployment -- no separate database service, (2) conversation history and user whitelist are simple relational data, (3) zero configuration, (4) Docker volume mount for persistence, (5) this app serves a handful of whitelisted users, not thousands. `better-sqlite3` is synchronous (no callback hell) and significantly faster than `sql.js` or the Node built-in. | MEDIUM (version may differ) |
| drizzle-orm | ~0.38 | ORM / query builder | Lightweight, type-safe SQL. Drizzle over Prisma because: (1) no code generation step -- schema is TypeScript, (2) much smaller footprint for Docker images, (3) SQL-like syntax means no ORM abstraction leaks, (4) excellent SQLite support via `drizzle-orm/better-sqlite3`. Drizzle Kit handles migrations. | MEDIUM (version may differ, 0.3x-0.4x range) |
| drizzle-kit | ~0.30 | Migrations | Schema migration tooling for Drizzle. Generates SQL migration files from schema changes. | MEDIUM (version may differ) |

### Validation & Schema

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| zod | ~3.24 | Runtime validation | Validates environment variables, webhook payloads, API responses from Sonarr/Radarr, and LLM tool call arguments. TypeScript-first. Integrates with Fastify via `fastify-type-provider-zod`. Single validation library for the entire app. | MEDIUM (version 3.2x range) |

### Logging

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| pino | ~9.6 | Structured logging | Fastify's built-in logger. JSON-structured logs work well with Docker log drivers. Fast, low-overhead. Use `pino-pretty` in dev only. | MEDIUM (version 9.x) |

### Scheduling

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| node-cron | ~3.0 | Cron scheduling | For proactive notifications (polling Sonarr/Radarr for completed downloads, new episodes). Simple cron syntax. Lightweight. No external scheduler needed for a single-container app. | HIGH (stable, simple library) |

---

## Supporting Libraries

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| fastify-type-provider-zod | ~2.0 | Zod + Fastify integration | Webhook route validation -- validates Twilio payloads at the route level | LOW (verify exists/version) |
| @fastify/cors | ~10.0 | CORS handling | Only if adding a health-check UI or admin endpoint later | MEDIUM |
| @fastify/rate-limit | ~10.0 | Rate limiting | Protect webhook endpoint from abuse, especially important since Twilio webhooks are publicly accessible | MEDIUM |
| dotenv | ~16.4 | Env loading | Development only. In production, Docker handles env vars. Load `.env` file in dev for convenience. | HIGH (stable) |
| nanoid | ~5.0 | ID generation | Conversation IDs, request correlation IDs. Smaller and faster than uuid. | MEDIUM |

---

## Development Tools

| Tool | Version | Purpose | Notes | Confidence |
|------|---------|---------|-------|------------|
| vitest | ~2.1 | Testing | Fast, TypeScript-native, ESM-first. Compatible with Jest API so no learning curve. Use for unit tests (LLM prompt construction, intent parsing logic, provider interface contracts). | MEDIUM (version may be 2.x+) |
| biome | ~1.9 | Lint + format | Single tool replacing ESLint + Prettier. Faster, zero-config for TypeScript. Reduces devDependencies and config files. | MEDIUM (version may differ) |
| docker compose | v2 | Local dev | Multi-service dev environment. Run app + mock Sonarr/Radarr for testing. | HIGH |

---

## Infrastructure

| Technology | Purpose | Why | Confidence |
|------------|---------|-----|------------|
| Docker (multi-stage build) | Container packaging | `node:22-slim` base. Multi-stage: build TypeScript in stage 1, copy compiled JS to slim production image. Keeps image small. | HIGH |
| Docker Compose | Development orchestration | Define app + volume mounts. Optionally add Sonarr/Radarr containers for integration testing. | HIGH |
| SQLite volume mount | Data persistence | Mount `/data` directory as Docker volume. SQLite DB file lives there. Survives container restarts. | HIGH |

### Dockerfile Strategy

```dockerfile
# Build stage
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:22-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

Note: `better-sqlite3` has native bindings. The build stage handles compilation. Both stages must use the same Node version and platform.

---

## Sonarr/Radarr Integration Strategy

There is **no established npm library** for Sonarr or Radarr API interaction. The ecosystem relies on direct HTTP calls to their REST APIs.

**Recommendation: Build a thin typed HTTP client, do NOT use a third-party wrapper.**

| Approach | Implementation | Why |
|----------|---------------|-----|
| Direct HTTP via `fetch` | Node 22's built-in `fetch` + Zod response validation | No dependency needed. Sonarr/Radarr APIs are straightforward REST. A typed client with Zod schemas gives better type safety than any existing wrapper library. |

The APIs are well-documented:
- Sonarr API v3: `{base_url}/api/v3/*` with `X-Api-Key` header
- Radarr API v3: `{base_url}/api/v3/*` with `X-Api-Key` header

Key endpoints to wrap:
- `GET /api/v3/series/lookup?term=` (Sonarr search)
- `GET /api/v3/movie/lookup?term=` (Radarr search)
- `POST /api/v3/series` / `POST /api/v3/movie` (add)
- `DELETE /api/v3/series/{id}` / `DELETE /api/v3/movie/{id}` (remove)
- `GET /api/v3/calendar` (upcoming, both services)
- `GET /api/v3/queue` (download status, both services)

Both APIs follow nearly identical patterns, so a shared base client with service-specific endpoint definitions is the clean approach.

---

## LLM Tool Calling Architecture

The OpenAI SDK's **function/tool calling** feature is the correct way to bridge natural language to API actions. Do NOT use regex parsing or keyword matching.

```typescript
// Define tools that map to Sonarr/Radarr actions
const tools = [
  {
    type: "function",
    function: {
      name: "search_show",
      description: "Search for a TV show by name",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Show name to search for" }
        },
        required: ["query"]
      }
    }
  },
  // ... search_movie, add_show, add_movie, get_upcoming, get_downloads, etc.
];
```

The LLM returns structured tool calls with validated arguments. The app executes the corresponding API call and feeds the result back as a tool response. This loop handles multi-step conversations naturally (search -> disambiguate -> add).

---

## Installation

```bash
# Core dependencies
npm install fastify openai twilio better-sqlite3 drizzle-orm zod pino node-cron nanoid

# Dev dependencies
npm install -D typescript tsx vitest biome drizzle-kit @types/better-sqlite3 @types/node
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| HTTP framework | Fastify | Express | Express lacks built-in schema validation, plugin system is ad-hoc, TypeScript support requires more boilerplate. Express 5 is fine but Fastify's architecture better fits modular providers. |
| HTTP framework | Fastify | Hono | Hono is excellent for edge/serverless but this is a long-running Docker container. Fastify's ecosystem (plugins, decorators, lifecycle hooks) is more mature for this use case. |
| Database | SQLite + better-sqlite3 | PostgreSQL | Overkill. Adds a second container, connection pooling complexity, and deployment burden for a single-digit user app. SQLite handles this workload trivially. |
| Database | SQLite + better-sqlite3 | SQLite via `sql.js` | `sql.js` compiles SQLite to WASM -- slower, higher memory, no native file locking. `better-sqlite3` uses native bindings and is significantly faster. |
| ORM | Drizzle | Prisma | Prisma requires a generation step (`prisma generate`), produces a large client, and its SQLite support has historically lagged. Drizzle is lighter and more SQL-transparent. |
| ORM | Drizzle | Knex | Knex is a query builder without type-safe schema inference. Drizzle provides both and the schema-as-code approach is cleaner. |
| ORM | Drizzle | Raw SQL | Works fine for simple cases but loses type safety. The 5-10 tables in this app (users, conversations, messages, etc.) benefit from typed queries without the overhead of a heavy ORM. |
| LLM SDK | openai | LangChain | Massively over-engineered for this use case. WadsMedia needs: send messages to LLM, get tool calls back, execute them. That is 50 lines of code with the OpenAI SDK. LangChain adds hundreds of abstractions, frequent breaking changes, and dependency bloat. |
| LLM SDK | openai | Vercel AI SDK | Good library but adds unnecessary abstraction. The OpenAI SDK's tool calling is direct and works with any compatible provider. AI SDK's streaming focus is unnecessary -- this app needs complete responses to execute API calls. |
| Validation | Zod | Joi / Yup | Zod is TypeScript-native with superior type inference. Joi is JavaScript-first. Yup is React-focused. Zod is the community standard for TypeScript validation in 2025. |
| Testing | Vitest | Jest | Vitest is faster, ESM-native, TypeScript-native. Same API as Jest so no learning curve. Jest's ESM support still requires configuration gymnastics. |
| Linting | Biome | ESLint + Prettier | Two tools, multiple config files, plugin compatibility issues. Biome does both in one tool, faster, simpler config. |
| Logging | Pino | Winston | Pino is Fastify's native logger (zero integration work), JSON-structured by default, faster. Winston is more configurable but that configurability is unnecessary here. |
| Scheduling | node-cron | Bull/BullMQ | Bull requires Redis. For simple periodic polling (check for completed downloads every N minutes), node-cron is sufficient. If job persistence or retry logic becomes needed, upgrade to BullMQ later. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| LangChain | Massive dependency tree, frequent breaking changes, abstractions hide what is happening. This app's LLM interaction is simple request-response with tool calling. | `openai` SDK directly |
| Prisma | Code generation step, large client bundle, slower cold starts in Docker. SQLite support has edge cases. | Drizzle ORM |
| MongoDB / Mongoose | Document database is wrong model for relational conversation data (users have conversations, conversations have messages, messages have tool calls). | SQLite + Drizzle |
| `ws` / WebSocket libraries | This app receives webhooks and sends API calls. No persistent connections to clients needed. WebSockets add complexity for zero benefit. | Fastify HTTP routes |
| `axios` | Node 22 has native `fetch`. No reason to add a dependency for HTTP client functionality that is built in. | Built-in `fetch` |
| `dotenv` in production | Docker provides env vars natively. Only use dotenv in development. | Docker `--env-file` or `environment:` in compose |
| NestJS | Enterprise-grade framework with decorators, DI containers, modules -- massive overhead for a single-purpose gateway app. | Fastify directly |
| `node-fetch` | Polyfill for `fetch` that is now built into Node 18+. Completely unnecessary with Node 22. | Built-in `fetch` |

---

## Stack Patterns by Variant

**If you need to support a local LLM (Ollama, LM Studio):**
- Set `OPENAI_BASE_URL=http://localhost:11434/v1` (Ollama) or similar
- The `openai` SDK handles this via the `baseURL` constructor parameter
- No code changes needed -- this is why we use the OpenAI-compatible interface

**If you add Telegram/Signal/Discord later:**
- Create a new provider implementing the messaging interface
- Register it as a Fastify plugin
- Each provider gets its own webhook route (`/webhooks/twilio`, `/webhooks/telegram`, etc.)
- The core conversation engine stays unchanged

**If conversation volume grows beyond SQLite comfort:**
- Migrate from SQLite to PostgreSQL
- Drizzle supports both with minimal schema changes (swap the dialect driver)
- Add `drizzle-orm/node-postgres` + `pg`
- This is a smooth migration path, not a rewrite

**If you want streaming LLM responses:**
- The OpenAI SDK supports streaming out of the box
- For messaging, streaming is generally not useful (you send one complete reply)
- Streaming is useful if you add a web UI later

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| better-sqlite3 | Node.js 18, 20, 22 | Native addon -- must match Node version in Docker. Build in same image as runtime. |
| drizzle-orm | better-sqlite3 via `drizzle-orm/better-sqlite3` | Use matching drizzle-orm and drizzle-kit versions |
| openai SDK | Any OpenAI-compatible API | Set `baseURL` for non-OpenAI providers. Tool calling requires the provider to support it. |
| twilio SDK | Node.js 18+ | Check minimum Node version in twilio's package.json at install time |
| Fastify 5 | Node.js 20+ | Fastify 5 dropped Node 18 support. Use Node 22 LTS. |
| TypeScript 5.x | All listed packages | Strict mode recommended. `"moduleResolution": "bundler"` or `"nodenext"` for ESM. |

---

## Project Structure Recommendation

```
wadsmedia/
  src/
    index.ts                  # Entry point: Fastify server setup
    config.ts                 # Environment variable loading + Zod validation
    db/
      schema.ts               # Drizzle schema (users, conversations, messages)
      migrations/             # Generated SQL migrations
      index.ts                # Database connection setup
    providers/
      messaging/
        interface.ts          # MessagingProvider interface
        twilio.ts             # Twilio RCS implementation
      llm/
        interface.ts          # LLM provider interface
        openai-compatible.ts  # OpenAI-compatible implementation
      media/
        interface.ts          # MediaServer interface
        sonarr.ts             # Sonarr API client
        radarr.ts             # Radarr API client
    engine/
      conversation.ts         # Core conversation loop (receive -> LLM -> execute -> respond)
      tools.ts                # LLM tool definitions
      handlers.ts             # Tool call execution handlers
    notifications/
      scheduler.ts            # Cron-based polling for proactive alerts
      checks.ts               # What to check (completed downloads, new episodes)
    routes/
      webhooks.ts             # Webhook routes for messaging providers
      health.ts               # Health check endpoint
  tests/
    unit/                     # Unit tests for pure logic
    integration/              # Integration tests with mock APIs
  Dockerfile
  docker-compose.yml
  tsconfig.json
  biome.json
  package.json
```

---

## Sources

- npm registry (attempted live queries, denied -- versions from training data cutoff May 2025)
- Sonarr API wiki: https://wiki.servarr.com/sonarr/api (endpoint patterns from training data)
- Radarr API wiki: https://wiki.servarr.com/radarr/api (endpoint patterns from training data)
- Twilio Messaging API documentation (RCS channel support from training data)
- OpenAI API reference (tool/function calling specification from training data)
- Fastify documentation (plugin architecture, TypeScript support from training data)
- Drizzle ORM documentation (SQLite driver support from training data)

**Confidence note:** All library choices are well-established ecosystem standards with stable APIs. The primary uncertainty is exact version numbers, which should be pinned at project initialization by running `npm install` and letting npm resolve current versions.

---
*Stack research for: WadsMedia -- conversational media server gateway*
*Researched: 2026-02-13*

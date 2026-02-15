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

# Copy Drizzle migration files (source files, not compiled output)
COPY drizzle/ ./drizzle/

# Copy admin dashboard templates and static assets
COPY admin-views/ ./admin-views/
COPY admin-assets/ ./admin-assets/

ENV NODE_ENV=production
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]

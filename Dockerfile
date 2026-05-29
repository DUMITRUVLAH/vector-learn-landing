# ─────────────────────────────────────────────────────────────
# Vector Learn — Production Dockerfile
# Multi-stage build: deps → frontend build → runtime
# ─────────────────────────────────────────────────────────────

# Stage 1: install all deps (incl. devDependencies for build)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Stage 2: build frontend
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: runtime
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Bring in built frontend + server code + migrations
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/tsconfig.server.json ./

# PGlite data directory (mount as volume in compose)
VOLUME ["/app/.pglite"]
ENV DATABASE_PATH=/app/.pglite

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health > /dev/null || exit 1

# tsx runs TS at runtime (no compile step needed for server)
RUN npm install -g tsx
CMD ["sh", "-c", "tsx server/db/migrate.ts && tsx server/index.ts"]

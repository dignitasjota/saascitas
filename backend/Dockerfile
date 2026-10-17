# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (better layer caching). This image builds the backend
# workspace in isolation (build context is ./backend), so there is no root
# lockfile here; use `npm install` rather than `npm ci`.
COPY package.json ./
RUN npm install --ignore-scripts --no-audit --no-fund

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Compile TypeScript
RUN npm run build

# Remove dev dependencies (prisma is a prod dependency so the CLI survives for
# `prisma migrate deploy` at runtime)
RUN npm prune --omit=dev

# ── Stage 2: production ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache dumb-init wget

WORKDIR /app
ENV NODE_ENV=production

# Copy only what's needed to run, owned by the non-root user so it can read
# the app and run `prisma migrate deploy` at startup.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/package.json ./

# Run as the built-in non-root user
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3001/v1/health || exit 1

# dumb-init handles signals properly (PID 1). nest build emits to dist/src
# (the project has sources outside src/), so the entry is dist/src/main.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/main"]

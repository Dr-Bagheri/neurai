# syntax=docker/dockerfile:1

# ── deps ─────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# ── build ────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Payload reads the DB at build time to generate types; a throwaway URI keeps
# the build hermetic and independent of a live database.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URI=postgres://build:build@localhost:5432/build
ENV PAYLOAD_SECRET=build-time-only-not-a-real-secret
RUN pnpm build

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

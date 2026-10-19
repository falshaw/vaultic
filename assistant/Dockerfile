# Vaultic assistant — 4-stage Node build.
# base (patched alpine) → deps (npm ci) → builder (prisma generate + next build)
# → runner (non-root, standalone, schema-push at startup).
FROM node:24.19-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS base
RUN apk upgrade --no-cache && apk add --no-cache libc6-compat openssl
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma 7 generate + next build need dummy env to satisfy required vars at build.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    JWT_SECRET="build-only-dummy-secret-32-characters-long" \
    NEXT_TELEMETRY_DISABLED=1
# Generate a real CycloneDX SBOM (runtime deps) for the evidence layer, then build.
RUN npx prisma generate && npm run sbom && npm run build

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
# Real CycloneDX SBOM produced at build — served (admin-only) via /api/sbom.
COPY --from=builder --chown=nextjs:nodejs /app/sbom.json ./sbom.json
# Full builder node_modules (generated Prisma client + the prisma CLI's transitive
# deps — e.g. @prisma/config → effect) so `prisma db push` works at startup. This
# overlays the standalone subset with the complete set (superset; runtime-safe).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

RUN rm -f .env
USER nextjs
EXPOSE 3000

# Push the schema (idempotent, no migrations) then launch the standalone server.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js db push --accept-data-loss && node server.js"]

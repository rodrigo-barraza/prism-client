# ============================================================
# Prism Client — Multi-stage Docker Build
# ============================================================
# AI chat interface built with Next.js. Uses standalone output
# mode for minimal image size. Secrets are resolved from Vault
# at build time via next.config.ts.
# ============================================================

# --- Base ---
FROM node:26-alpine AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN apk add --no-cache git
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# --- Build ---
FROM deps AS builder
WORKDIR /app

# curl is required by the vault client's fetchSync() (execFileSync("curl"))
# to resolve secrets at build time. Alpine doesn't include it by default.
RUN apk add --no-cache curl

# Vault credentials — needed at build time for next.config.ts
# to resolve PRISM_SERVICE_URL, TOOLS_SERVICE_URL, etc.
ARG VAULT_SERVICE_URL=http://192.168.86.2:5599
ENV VAULT_SERVICE_URL=$VAULT_SERVICE_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=VAULT_SERVICE_TOKEN \
  export VAULT_SERVICE_TOKEN=$(cat /run/secrets/VAULT_SERVICE_TOKEN 2>/dev/null) && \
  pnpm run build

# --- Production ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3333
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone server, static assets, and boot script
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/boot.js ./boot.js

USER nextjs

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 -O /dev/null http://127.0.0.1:3333/ || exit 1

CMD ["node", "boot.js"]

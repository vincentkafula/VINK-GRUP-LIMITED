# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# better-sqlite3 (Manshya core) is a native module; alpine needs a toolchain if no prebuilt binary matches.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm install

COPY src/ ./src/
COPY tsconfig.json tsconfig.build.json ./

RUN npm run build && npm prune --omit=dev

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Manshya's SQLite database and uploaded KYC documents live here. Mount a volume at /data
# (Railway: add a Volume) or they are lost on every deploy.
ENV MANSHYA_DB_PATH=/data/manshya.db
RUN mkdir -p /data

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3001}/health || exit 1

CMD ["node", "dist/index.js"]

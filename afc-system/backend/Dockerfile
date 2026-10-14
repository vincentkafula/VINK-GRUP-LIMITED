# Build context is the afc-system folder:  docker build -f backend/Dockerfile .
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# dependencies first (cached until a package.json changes); every workspace's manifest is needed so npm can resolve the lockfile
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY validator/package.json validator/
COPY dashboard/package.json dashboard/
RUN npm ci --omit=dev --workspace=@afc/backend --workspace=@afc/shared --include-workspace-root

COPY tsconfig.base.json ./
COPY shared shared
COPY backend backend
RUN cd backend && npx prisma generate

ENV NODE_ENV=production
WORKDIR /app/backend
EXPOSE 4000
USER node
# apply database migrations, then start. Migrations are idempotent, so every restart is safe.
CMD ["sh", "-c", "npx prisma migrate deploy && exec npx tsx src/server.ts"]

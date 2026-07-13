# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build-time environment (public/build-time only — never put secrets here)
ARG VITE_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# ── Stage 2: Serve with nginx ──────────────────────────────────────────────────
FROM nginx:alpine AS runner

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing — all unknown routes fall back to index.html.
# Use nginx's built-in template mechanism (/etc/nginx/templates/*.template)
# so the listen port is filled in from Railway's dynamic $PORT at container
# start, instead of being hardcoded to 80. The base nginx image auto-runs
# envsubst on this file into /etc/nginx/conf.d/default.conf before nginx starts.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Fallback default; Railway overrides this with its own injected PORT value.
ENV PORT=8080
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]


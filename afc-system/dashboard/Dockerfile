# Build context is the afc-system folder:  docker build -f dashboard/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.com .
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY validator/package.json validator/
COPY dashboard/package.json dashboard/
RUN npm ci --workspace=@afc/dashboard --include-workspace-root
COPY dashboard dashboard
# the API address is baked into the browser code at build time
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @afc/dashboard

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/dashboard/.next/standalone ./
COPY --from=build /app/dashboard/.next/static ./dashboard/.next/static
USER node
EXPOSE 3000
CMD ["node", "dashboard/server.js"]

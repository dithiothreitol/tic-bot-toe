# syntax=docker/dockerfile:1
# Multi-stage build → tiny runtime (self-contained server bundle, no node_modules).
# Build context is the repo root: `docker build -f deploy/Dockerfile .`

# ---- Build stage: install deps, build web (Vite) + server (tsup) ----
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

# Manifests first for cached dependency layers.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/game-core/package.json packages/game-core/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile

# Sources + build.
COPY . .
RUN pnpm --filter @arena/web build \
 && pnpm --filter @arena/server build

# ---- Runtime stage: node + bundle + migrations + built frontend ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    STATIC_DIR=/app/web

# Fonts for the OG canvas renderer (Alpine ships none — DejaVu covers Polish).
RUN apk add --no-cache font-dejavu

COPY --from=build /app/apps/server/dist/index.js ./index.js
COPY --from=build /app/apps/server/drizzle ./drizzle
COPY --from=build /app/apps/web/dist ./web

# @napi-rs/canvas is native and can't be bundled — install just this one package
# (pulls the matching prebuilt linux binary) so the OG endpoint (§11) works.
COPY --from=build /app/apps/server/package.json ./server-package.json
RUN CANVAS_VER=$(node -e "console.log(require('./server-package.json').dependencies['@napi-rs/canvas'])") \
 && npm install --no-save --omit=dev @napi-rs/canvas@"$CANVAS_VER" \
 && rm server-package.json

EXPOSE 8080
# Migrations run automatically on boot (see apps/server/src/index.ts).
CMD ["node", "index.js"]

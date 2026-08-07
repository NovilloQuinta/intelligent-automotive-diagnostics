FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/core-api/package.json ./apps/core-api/

RUN pnpm install --frozen-lockfile --prod=false

COPY apps/core-api/tsconfig.json ./apps/core-api/
COPY apps/core-api/src ./apps/core-api/src/

RUN pnpm --filter core-api build

FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/apps/core-api/package.json ./apps/core-api/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/core-api/dist ./apps/core-api/dist/

RUN mkdir -p /app/data

EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000

# SECURITY: ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must be injected at
# runtime (e.g. docker run -e or secrets manager). The app will refuse to start
# with default/dev values in production.

CMD ["node", "apps/core-api/dist/main.js"]

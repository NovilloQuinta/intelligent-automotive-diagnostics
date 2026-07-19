FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY apps/core-api/package.json apps/core-api/pnpm-lock.yaml ./apps/core-api/

RUN pnpm install --frozen-lockfile --prod=false

COPY apps/core-api/tsconfig.json ./apps/core-api/
COPY apps/core-api/src ./apps/core-api/src/

RUN pnpm --filter core-api build

FROM node:20-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=builder /app/apps/core-api/package.json /app/apps/core-api/pnpm-lock.yaml ./apps/core-api/
COPY --from=builder /app/pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/core-api/dist ./apps/core-api/dist/

RUN mkdir -p /app/data

EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000
ENV ACCESS_TOKEN_SECRET=change-me-in-production
ENV REFRESH_TOKEN_SECRET=change-me-in-production

CMD ["node", "apps/core-api/dist/main.js"]

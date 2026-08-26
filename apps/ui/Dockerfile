FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/ui/package.json ./apps/ui/

RUN pnpm install --frozen-lockfile --prod=false

COPY apps/ui/tsconfig.json apps/ui/vite.config.ts ./apps/ui/
COPY apps/ui/src ./apps/ui/src/
COPY apps/ui/index.html ./apps/ui/

RUN pnpm --filter ui build

FROM nginx:alpine AS runner

COPY apps/ui/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY apps/ui/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=builder /app/apps/ui/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

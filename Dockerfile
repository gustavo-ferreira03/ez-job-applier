FROM node:slim

RUN npm install -g pnpm@10.30.1

RUN apt-get update \
    && apt-get install -y --no-install-recommends xvfb x11vnc procps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
RUN pnpm install --frozen-lockfile

RUN apt-get update \
    && cd apps/backend && pnpm exec playwright-core install-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY . .

ARG PUBLIC_API_URL=http://localhost:3000
RUN pnpm --filter backend build \
    && PUBLIC_API_URL="${PUBLIC_API_URL:-http://localhost:3000}" pnpm --filter frontend build

ENV CLOAKBROWSER_CACHE_DIR=/opt/cloakbrowser
RUN cd apps/backend && pnpm exec cloakbrowser install

RUN chmod +x /app/entrypoint.sh

ENV NODE_ENV=production
ENV FRONTEND_PORT=3001
EXPOSE 3000 3001

CMD ["/app/entrypoint.sh"]

FROM node:22-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json server.ts ./
COPY src/ src/
COPY portal/ portal/
COPY config.example.yaml ./

RUN pnpm run build

FROM node:22-slim
WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/portal/.next ./portal/.next
COPY --from=builder /app/portal/next.config.mjs ./portal/next.config.mjs
COPY --from=builder /app/config.example.yaml ./config.yaml

RUN mkdir -p data

ENV NODE_ENV=production
ENV PORTAL_DATA_DIR=/app/data

EXPOSE 8443
CMD ["node", "dist/server.js"]

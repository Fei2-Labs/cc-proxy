# syntax=docker/dockerfile:1

# Stage 1: native deps — only re-runs when lockfile changes
FROM node:22-slim AS native
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Stage 2: build — only source changes trigger this
FROM native AS builder
COPY tsconfig.json server.ts ./
COPY src/ src/
COPY portal/ portal/
COPY config.example.yaml ./
RUN --mount=type=cache,id=nextcache,target=/app/portal/.next/cache \
    pnpm run build

# Stage 3: runtime
FROM node:22-slim
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/portal/.next ./portal/.next
COPY --from=builder /app/portal/next.config.mjs ./portal/next.config.mjs
COPY --from=builder /app/portal/postcss.config.mjs ./portal/postcss.config.mjs
COPY --from=builder /app/portal/tsconfig.json ./portal/tsconfig.json
COPY --from=builder /app/package.json ./
COPY --from=builder /app/config.example.yaml ./config.yaml
RUN mkdir -p data
ENV NODE_ENV=production
ENV PORTAL_DATA_DIR=/app/data
EXPOSE 8443
CMD ["node", "--trace-warnings", "dist/server.js"]

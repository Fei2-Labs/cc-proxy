# Phase 7: Deployment - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Update the Dockerfile for a multi-stage build that compiles both the TypeScript proxy and the Next.js portal into a single production image. Update docker-compose.yml for Dokploy deployment with correct volumes, ports, and environment variables. The image must be publishable to DockerHub.

</domain>

<decisions>
## Implementation Decisions

### Docker Build
- **D-01:** Multi-stage build: stage 1 installs deps + builds TypeScript + Next.js, stage 2 copies only production artifacts.
- **D-02:** Use pnpm (not npm) — project uses pnpm throughout.
- **D-03:** Next.js standalone output mode (`output: 'standalone'`) to minimize image size.
- **D-04:** Copy `config.example.yaml` as default config inside the image.

### Runtime
- **D-05:** Entry point is `node dist/server.js` (the custom Next.js server).
- **D-06:** Data directory (`data/`) is a Docker volume for SQLite persistence.
- **D-07:** `ADMIN_PASSWORD` and `NODE_ENV=production` set via environment variables.

### Docker Compose
- **D-08:** Single service, port mapping, data volume, environment variables, restart policy.
- **D-09:** Compatible with Dokploy docker-compose deployment.

</decisions>

<code_context>
## Existing Code Insights

### Current Dockerfile
- Old multi-stage build using npm, only compiles TypeScript proxy
- Does not build Next.js portal
- Entry point is `dist/index.js` (old proxy-only entry)
- Copies `config.example.yaml` as `config.yaml`

### Current docker-compose.yml
- Maps port 8443, mounts config.yaml and certs as read-only volumes
- No data volume for SQLite
- No environment variables for portal

### Build Scripts
- `pnpm run build` = `tsc && next build portal`
- `pnpm run start` = `node dist/server.js`
- Next.js config in `portal/next.config.mjs` with turbopack settings

### Integration Points
- `Dockerfile` — Complete rewrite needed
- `docker-compose.yml` — Update for portal requirements
- `portal/next.config.mjs` — Add `output: 'standalone'`
- `.dockerignore` — Create to exclude unnecessary files

</code_context>

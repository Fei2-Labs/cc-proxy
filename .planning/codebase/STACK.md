# Technology Stack

**Analysis Date:** 2026-04-02

## Languages

**Primary:**
- TypeScript 5.7+ - All application code in `src/`

**Secondary:**
- Bash - Client setup and token extraction scripts in `scripts/`

## Runtime

**Environment:**
- Node.js 22 (specified in `Dockerfile` as `node:22-slim`)
- ES Modules (`"type": "module"` in `package.json`)
- Target: ES2022 (`tsconfig.json` compilerOptions.target)

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- No web framework. The proxy server uses Node.js built-in `http` and `https` modules directly (`src/proxy.ts`).

**Testing:**
- No test framework. Tests run directly via `tsx`: `tsx tests/rewriter.test.ts` (`package.json` scripts.test)

**Build/Dev:**
- TypeScript 5.7+ - Compilation via `tsc` (`package.json` scripts.build)
- tsx 4.19+ - Dev-time execution and watch mode (`package.json` scripts.dev)

## Key Dependencies

**Critical (runtime):**
- `yaml` ^2.7.0 - Parses `config.yaml` configuration file. The only runtime dependency. Used in `src/config.ts`.

**Development:**
- `@types/node` ^22.0.0 - Node.js type definitions
- `tsx` ^4.19.0 - TypeScript execution for dev mode (`npm run dev`), scripts (`npm run generate-token`, `npm run generate-identity`), and tests
- `typescript` ^5.7.0 - TypeScript compiler

**Built-in Node.js modules used (no npm packages):**
- `https` / `http` - TLS server and upstream proxy requests (`src/proxy.ts`)
- `fs` - Reading config files and TLS certificates (`src/config.ts`, `src/proxy.ts`)
- `url` - URL parsing for upstream routing (`src/proxy.ts`)
- `crypto` - Token and identity generation (`src/scripts/generate-token.ts`, `src/scripts/generate-identity.ts`)
- `path` - Config file path resolution (`src/config.ts`)

## Configuration

**Application Config:**
- YAML-based configuration via `config.yaml` (copy from `config.example.yaml`)
- Config path optionally passed as CLI argument: `node dist/index.js [path]`
- Defaults to `./config.yaml` in working directory if no argument provided
- Config loaded and validated at startup in `src/config.ts`

**Required config sections:**
- `server.port` and optional `server.tls` (cert/key paths)
- `upstream.url` - Anthropic API endpoint
- `oauth.refresh_token` - OAuth refresh token from Claude Code browser login
- `auth.tokens` - Array of named bearer tokens for client authentication
- `identity` - Canonical device_id and email
- `env` - Canonical environment fingerprint fields
- `prompt_env` - System prompt environment masking values
- `process` - Canonical process memory/heap metrics
- `logging` - Log level and audit toggle

**TLS Certificates:**
- Optional TLS via `server.tls.cert` and `server.tls.key` in config
- Falls back to plain HTTP if not configured (with warning)
- Certs mounted read-only in Docker via `docker-compose.yml`

**Build:**
- `tsconfig.json` - strict mode, ES2022 target, ESNext modules, bundler module resolution
- Output to `dist/` directory with declarations and source maps

## Platform Requirements

**Development:**
- Node.js 22+
- npm
- Optional: TLS certificates for HTTPS (self-signed OK)

**Production:**
- Docker (multi-stage build in `Dockerfile`)
- Default port: 8443
- TLS certificates recommended (mounted via volume)
- `config.yaml` mounted as read-only volume

**Docker Setup:**
- Multi-stage build: builder stage compiles TypeScript, production stage runs `node dist/index.js`
- Base image: `node:22-slim`
- Exposed port: 8443
- `docker-compose.yml` mounts `config.yaml` and `certs/` as read-only volumes
- JSON file logging driver with 10MB rotation (3 files max)

## NPM Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `tsc` | Compile TypeScript to `dist/` |
| `start` | `node dist/index.js` | Run production server |
| `dev` | `tsx watch src/index.ts` | Development with file watching |
| `generate-token` | `tsx src/scripts/generate-token.ts` | Generate a client bearer token |
| `generate-identity` | `tsx src/scripts/generate-identity.ts` | Generate a canonical device_id |
| `test` | `tsx tests/rewriter.test.ts` | Run rewriter tests |

---

*Stack analysis: 2026-04-02*

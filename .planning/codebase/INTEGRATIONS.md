# External Integrations

**Analysis Date:** 2026-04-02

## APIs & External Services

**Anthropic Claude API (upstream):**
- Purpose: Primary upstream target. All proxied requests are forwarded here.
- Base URL: Configurable via `config.upstream.url`, defaults to `https://api.anthropic.com`
- Endpoints proxied:
  - `/v1/messages` - Claude inference API (body rewritten for identity normalization)
  - `/api/event_logging/batch` - Telemetry events (body rewritten for identity normalization)
  - `/policy_limits`, `/settings` - Policy and settings endpoints (generic identity rewrite)
  - All other paths are forwarded as-is
- Protocol: HTTPS (uses Node.js `https.request` in `src/proxy.ts`)
- Auth: OAuth Bearer token injected by gateway (replaces client-sent auth)
- Response streaming: SSE responses piped directly via `proxyRes.pipe(res)` (`src/proxy.ts:148`)

**Anthropic OAuth Platform:**
- Purpose: Token lifecycle management. Gateway refreshes OAuth access tokens centrally.
- Endpoint: `https://platform.claude.com/v1/oauth/token` (hardcoded in `src/oauth.ts:4`)
- Client ID: `9d1c250a-e61b-44d9-88ed-5944d1962f5e` (hardcoded in `src/oauth.ts:5`)
- OAuth scopes: `user:inference`, `user:profile`, `user:sessions:claude_code`, `user:mcp_servers`, `user:file_upload`
- Flow: Refresh token grant (`grant_type: refresh_token`)
- Auto-refresh: Scheduled 5 minutes before token expiry (`src/oauth.ts:40`)
- Retry on failure: 30-second retry interval (`src/oauth.ts:52`)
- Config: `oauth.refresh_token` in `config.yaml`

## Data Storage

**Databases:**
- None. The gateway is stateless.

**File Storage:**
- Local filesystem only:
  - `config.yaml` - Application configuration (read at startup, `src/config.ts`)
  - TLS cert/key files - Read at startup if TLS enabled (`src/proxy.ts:26-27`)

**Caching:**
- In-memory only:
  - OAuth tokens cached in module-level variable (`src/oauth.ts:20`)
  - Auth token map cached in module-level Map (`src/auth.ts:4`)

## Authentication & Identity

**Gateway-to-Upstream Auth:**
- OAuth 2.0 refresh token flow against `platform.claude.com`
- Gateway holds and auto-refreshes the access token
- Access token injected into every proxied request's `Authorization` header (`src/proxy.ts:124`)
- Refresh token sourced from admin machine's Claude Code browser login (extracted via `scripts/extract-token.sh`)

**Client-to-Gateway Auth:**
- Bearer token authentication via `Authorization` or `Proxy-Authorization` headers (`src/auth.ts:18`)
- Tokens defined in `config.yaml` under `auth.tokens` (array of name/token pairs)
- Token generation: `npm run generate-token` produces 32 random bytes as hex (`src/scripts/generate-token.ts`)
- Client setup: `scripts/client-setup.sh` configures environment variables on client machines

## Monitoring & Observability

**Error Tracking:**
- None (no external error tracking service)

**Logs:**
- Custom console logger (`src/logger.ts`)
- Structured format: `[ISO_TIMESTAMP] [LEVEL] message`
- Log levels: debug, info, warn, error (configurable via `config.logging.level`)
- Audit logging: `[ISO_TIMESTAMP] [AUDIT] client=name METHOD /path -> status` (toggled via `config.logging.audit`)
- Docker log rotation: JSON file driver, 10MB max, 3 files (`docker-compose.yml`)

## CI/CD & Deployment

**Hosting:**
- Self-hosted via Docker
- `Dockerfile` - Multi-stage build (node:22-slim)
- `docker-compose.yml` - Single service deployment with volume mounts

**CI Pipeline:**
- None detected

## Environment Configuration

**Required config values (in `config.yaml`):**
- `server.port` - Listening port (default: 8443)
- `upstream.url` - Anthropic API URL
- `oauth.refresh_token` - OAuth refresh token from browser login
- `auth.tokens` - At least one client bearer token
- `identity.device_id` - 64-char hex canonical device ID
- `identity.email` - Canonical email address
- `env.*` - Environment fingerprint fields (platform, arch, node_version, etc.)
- `prompt_env.*` - System prompt environment masking (platform, shell, os_version, working_dir)
- `process.*` - Canonical memory/heap metrics

**Client-side environment variables (set by `scripts/client-setup.sh`):**
- `ANTHROPIC_BASE_URL` - Gateway URL (e.g., `https://gateway.office.com:8443`)
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` - Disables Datadog, GrowthBook, update checks
- `CLAUDE_CODE_OAUTH_TOKEN=gateway-managed` - Placeholder (gateway injects real token)
- `ANTHROPIC_CUSTOM_HEADERS` - `Proxy-Authorization: Bearer <token>` for gateway auth

**Secrets location:**
- `config.yaml` contains the OAuth refresh token and client bearer tokens
- TLS private key at path specified in `config.yaml` `server.tls.key`
- No `.env` files used

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Network Security

**Clash Rules (`clash-rules.yaml`):**
- Template for ClashX/Clash Verge network proxy
- Purpose: Block direct client connections to Anthropic services
- Blocks: `*.anthropic.com`, `*.claude.com`, `*.claude.ai`, `*.datadoghq.com`, `storage.googleapis.com`
- Allows: Gateway domain (configurable)

## Gateway-Provided Endpoints

**`/_health`** (no auth required):
- Returns gateway status, OAuth validity, canonical device info, upstream URL, client list
- Status 200 if OAuth valid, 503 if degraded

**`/_verify`** (auth required):
- Dry-run showing how the rewriter transforms a sample request
- Returns before/after comparison of identity fields

---

*Integration audit: 2026-04-02*

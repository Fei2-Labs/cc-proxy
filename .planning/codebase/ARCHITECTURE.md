# Architecture

**Analysis Date:** 2026-04-02

## Pattern Overview

**Overall:** Single-process reverse proxy (gateway pattern)

**Key Characteristics:**
- Zero-dependency HTTP/HTTPS reverse proxy (only runtime dep: `yaml` for config parsing)
- Intercepts Claude Code API traffic, rewrites identity/telemetry fields, forwards to Anthropic upstream
- Centralized OAuth token lifecycle management -- clients never contact Anthropic directly
- All clients appear as a single canonical device identity to the upstream API

## Layers

**Entry / Bootstrap:**
- Purpose: Parse CLI args, load config, initialize OAuth, start HTTP server
- Location: `src/index.ts`
- Contains: Top-level orchestration (config load, OAuth init, proxy start)
- Depends on: `config.ts`, `logger.ts`, `oauth.ts`, `proxy.ts`
- Used by: Node.js runtime (direct execution)

**HTTP Server / Request Router:**
- Purpose: Accept incoming HTTP(S) requests, route to handlers, forward to upstream
- Location: `src/proxy.ts`
- Contains: Server creation (HTTP or HTTPS), request handler, health/verify endpoints, upstream forwarding
- Depends on: `auth.ts`, `oauth.ts`, `rewriter.ts`, `logger.ts`, `config.ts`
- Used by: `src/index.ts` (called via `startProxy()`)

**Authentication:**
- Purpose: Validate client bearer tokens against configured token list
- Location: `src/auth.ts`
- Contains: Token map initialization, request authentication via `Authorization` or `Proxy-Authorization` headers
- Depends on: `config.ts` (types only)
- Used by: `src/proxy.ts`

**OAuth Token Manager:**
- Purpose: Manage upstream Anthropic OAuth access token lifecycle (refresh, cache, auto-renew)
- Location: `src/oauth.ts`
- Contains: Token refresh against `platform.claude.com`, automatic scheduling of pre-expiry refresh, cached token access
- Depends on: `logger.ts`
- Used by: `src/proxy.ts` (via `getAccessToken()`), `src/index.ts` (via `initOAuth()`)

**Request Rewriter:**
- Purpose: Rewrite request bodies and headers to replace real client identity with canonical identity
- Location: `src/rewriter.ts`
- Contains: Body rewriting for `/v1/messages` and `/api/event_logging/batch`, header normalization, prompt text rewriting
- Depends on: `config.ts` (types), `logger.ts`
- Used by: `src/proxy.ts`

**Configuration:**
- Purpose: Load and validate YAML config file
- Location: `src/config.ts`
- Contains: Config type definitions, YAML loading, validation checks
- Depends on: `yaml` (npm package)
- Used by: All modules (via `Config` type), `src/index.ts` (via `loadConfig()`)

**Logging:**
- Purpose: Structured console logging with level filtering and audit trail
- Location: `src/logger.ts`
- Contains: Level-based log function, audit log for per-request tracking
- Depends on: Nothing
- Used by: All other modules

## Data Flow

**Standard API Request (e.g., /v1/messages):**

1. Client sends HTTPS request to gateway with `Proxy-Authorization: Bearer <client-token>`
2. `proxy.ts:handleRequest()` authenticates client via `auth.ts:authenticate()`
3. `oauth.ts:getAccessToken()` provides the current upstream OAuth access token
4. Request body is buffered, then `rewriter.ts:rewriteBody()` replaces identity fields (device_id, env fingerprint, home paths, billing headers)
5. `rewriter.ts:rewriteHeaders()` strips client auth headers, normalizes User-Agent and billing header
6. Gateway injects real OAuth token as `Authorization: Bearer <access-token>`
7. Request is forwarded to `api.anthropic.com` via Node.js `https.request()`
8. Response is streamed back to client via `proxyRes.pipe(res)` (supports SSE streaming)

**OAuth Token Refresh (background):**

1. On startup, `oauth.ts:initOAuth()` exchanges refresh token for access token via `platform.claude.com/v1/oauth/token`
2. `scheduleRefresh()` sets a timer to refresh 5 minutes before token expiry
3. On refresh, new access token (and potentially new refresh token) is cached in memory
4. On failure, retry after 30 seconds

**Event Telemetry Rewrite (/api/event_logging/batch):**

1. Body contains array of events, each with `event_data`
2. Per-event: `device_id`, `email` replaced with canonical values
3. `env` object replaced entirely with canonical environment fingerprint
4. `process` metrics (may be base64-encoded) rewritten with canonical memory/heap ranges
5. Gateway-leaking fields (`baseUrl`, `gateway`) stripped
6. `additional_metadata` base64 blob decoded, sanitized, re-encoded

**State Management:**
- OAuth tokens: In-memory singleton (`cachedTokens` in `oauth.ts`)
- Auth token map: In-memory `Map<string, TokenEntry>` in `auth.ts`
- Config: Loaded once at startup, passed by reference to all functions
- No database, no persistent state, no session store

## Key Abstractions

**Config (canonical identity source):**
- Purpose: Single source of truth for the canonical device identity, environment fingerprint, and process metrics
- Examples: `src/config.ts`, `config.example.yaml`
- Pattern: YAML file loaded at startup, validated, threaded through all functions as a typed object

**Rewriter (privacy normalization engine):**
- Purpose: Transform API request payloads so multiple real clients appear as one canonical device
- Examples: `src/rewriter.ts`
- Pattern: Pure functions that accept `(body/headers, config)` and return rewritten output. Path-based dispatch (`/v1/messages` vs `/api/event_logging/batch`)

**OAuth Manager (token lifecycle):**
- Purpose: Abstract away OAuth complexity from clients -- gateway is the single OAuth participant
- Examples: `src/oauth.ts`
- Pattern: Module-level singleton state with timer-based auto-refresh

## Entry Points

**Main process entry:**
- Location: `src/index.ts`
- Triggers: `node dist/index.js [config-path]` or `npm run dev`
- Responsibilities: Load config, init OAuth, start HTTP(S) server

**HTTP endpoints (in `src/proxy.ts`):**
- `/_health` -- Health check (no auth). Returns OAuth status, upstream URL, connected clients.
- `/_verify` -- Dry-run verification (auth required). Shows before/after rewrite of a sample payload.
- `/*` -- All other paths are proxied to upstream after auth + rewrite.

**Utility scripts:**
- `src/scripts/generate-token.ts` -- Generate a random 32-byte hex bearer token for a new client
- `src/scripts/generate-identity.ts` -- Generate a random 32-byte hex device_id for the canonical identity

## Error Handling

**Strategy:** Fail-fast on startup, graceful degradation at runtime

**Patterns:**
- Startup validation: `config.ts:loadConfig()` throws on missing `device_id`, empty `auth.tokens`, or missing `oauth.refresh_token`. Process exits with code 1.
- OAuth failure: If token refresh fails, logs error and retries after 30s. `getAccessToken()` returns `null` when expired, causing 503 response to clients.
- Body rewrite failure: Caught per-request, logged as error, original body forwarded unchanged (fail-open for rewrite, fail-closed for auth).
- Upstream error: `proxyReq.on('error')` returns 502 to client with error detail.
- Non-JSON body: Silently passed through unchanged (intentional -- only JSON payloads contain identity fields).

## Cross-Cutting Concerns

**Logging:**
- Custom level-based logger in `src/logger.ts`. Uses `console.log` with ISO timestamps and level prefix.
- Audit logging (optional, config-controlled) records `client=name METHOD /path -> status` per request.
- Log level set from config at startup via `setLogLevel()`.

**Validation:**
- Config validation at startup only (device_id format, required fields).
- No runtime input validation beyond JSON parse checks in the rewriter.

**Authentication:**
- Two-layer auth: (1) client-to-gateway via bearer tokens in `Proxy-Authorization`/`Authorization`, (2) gateway-to-upstream via OAuth access token.
- Client tokens are static, configured in YAML. No rotation mechanism beyond config file edit + restart.

**TLS:**
- Optional TLS termination at the gateway. Configured via `server.tls.cert` and `server.tls.key` in config.
- Falls back to plain HTTP with a warning log if TLS not configured.

---

*Architecture analysis: 2026-04-02*

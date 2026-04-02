# Coding Conventions

**Analysis Date:** 2026-04-02

## Naming Patterns

**Files:**
- Use lowercase kebab-style single-word names: `proxy.ts`, `auth.ts`, `rewriter.ts`, `logger.ts`, `oauth.ts`, `config.ts`
- Entry point: `index.ts`
- Scripts live in `src/scripts/` with kebab-case names: `generate-token.ts`, `generate-identity.ts`

**Functions:**
- Use camelCase: `rewriteBody`, `rewriteHeaders`, `loadConfig`, `startProxy`, `initAuth`, `getAccessToken`
- Prefix initializers with `init`: `initAuth()`, `initOAuth()`
- Prefix builders with `build`: `buildCanonicalEnv()`, `buildCanonicalProcess()`, `buildVerificationPayload()`
- Prefix getters with `get`: `getAccessToken()`

**Variables:**
- Use camelCase: `cachedTokens`, `tokenMap`, `currentLevel`, `clientName`
- Constants use UPPER_SNAKE_CASE: `TOKEN_URL`, `CLIENT_ID`, `DEFAULT_SCOPES`, `LEVEL_ORDER`

**Types:**
- Use PascalCase: `Config`, `TokenEntry`, `OAuthTokens`, `LogLevel`
- Define types with `type`, not `interface` (the codebase exclusively uses `type`)

## Code Style

**Formatting:**
- No linter or formatter configured (no `.eslintrc`, `.prettierrc`, or `biome.json`)
- Indentation: 2 spaces
- Strings: single quotes throughout
- Semicolons: omitted (no-semicolon style)
- Trailing commas: used in multi-line objects and arrays

**Module System:**
- ESM (`"type": "module"` in `package.json`)
- Import paths include `.js` extension even for `.ts` source files: `import { loadConfig } from './config.js'`
- Always use named exports, no default exports anywhere
- Top-level `await` is used in `src/index.ts`

**TypeScript Strictness:**
- `"strict": true` in `tsconfig.json`
- Target: ES2022 with ESNext modules and bundler resolution
- Use `type` imports for type-only imports: `import type { Config } from './config.js'`

## Import Organization

**Order:**
1. Node.js built-in modules (`fs`, `https`, `http`, `url`, `crypto`)
2. External packages (`yaml`)
3. Internal modules (relative `.js` paths)

**Path Aliases:**
- None configured. All imports use relative paths.

**Example from `src/proxy.ts`:**
```typescript
import { createServer as createHttpsServer, type ServerOptions } from 'https'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'http'
import { readFileSync } from 'fs'
import { request as httpsRequest } from 'https'
import { URL } from 'url'
import type { Config } from './config.js'
import { authenticate, initAuth } from './auth.js'
import { getAccessToken } from './oauth.js'
import { rewriteBody, rewriteHeaders } from './rewriter.js'
import { audit, log } from './logger.js'
```

## Error Handling

**Patterns:**

1. **Top-level try/catch with fatal exit** - Entry point wraps startup in try/catch, logs error, exits with code 1:
   ```typescript
   // src/index.ts
   try {
     const config = loadConfig(configPath)
     // ...
   } catch (err) {
     console.error(`Fatal: ${err instanceof Error ? err.message : err}`)
     process.exit(1)
   }
   ```

2. **Config validation via thrown errors** - `loadConfig()` in `src/config.ts` throws descriptive `Error` objects for invalid configuration. Error messages include remediation instructions.

3. **Inline try/catch with logging** - Non-fatal operations catch errors and log them, allowing the request to continue:
   ```typescript
   // src/rewriter.ts - body rewrite failure is non-fatal
   try {
     body = rewriteBody(body, path, config) as Buffer<ArrayBuffer>
   } catch (err) {
     log('error', `Body rewrite failed for ${path}: ${err}`)
   }
   ```

4. **Silent catch for parse failures** - JSON parse failures in rewriter return original data unchanged:
   ```typescript
   try {
     parsed = JSON.parse(text)
   } catch {
     return body  // Not JSON - pass through
   }
   ```

5. **HTTP error responses** - Return JSON error objects with appropriate status codes:
   ```typescript
   res.writeHead(401, { 'Content-Type': 'application/json' })
   res.end(JSON.stringify({ error: 'Unauthorized' }))
   ```

6. **Upstream error handling** - Proxy errors caught via `proxyReq.on('error', ...)`, return 502 with details.

## Logging

**Framework:** Custom logger in `src/logger.ts` wrapping `console.log`

**Log Levels:** `debug` | `info` | `warn` | `error` (configurable via `config.logging.level`)

**Format:** `[ISO_TIMESTAMP] [LEVEL] message` with optional JSON extra data

**Usage pattern:**
```typescript
import { log } from './logger.js'

log('info', 'CC Gateway starting...')
log('debug', `Rewrote metadata.user_id device_id`)
log('warn', `Unauthorized request: ${method} ${path}`)
log('error', `Body rewrite failed for ${path}: ${err}`)
```

**Audit logging:** Separate `audit()` function for request tracking, gated by `config.logging.audit`:
```typescript
import { audit } from './logger.js'
audit(clientName, method, path, status)
// Output: [ISO_TIMESTAMP] [AUDIT] client=machine-a POST /v1/messages -> 200
```

**Guidelines:**
- Use `log('debug', ...)` for field-level rewrite details
- Use `log('info', ...)` for startup messages and token refresh events
- Use `log('warn', ...)` for unauthorized access and degraded state
- Use `log('error', ...)` for upstream failures and OAuth issues
- Use `audit()` for per-request tracking (separate from log levels)

## Comments

**When to Comment:**
- JSDoc `/** */` comments on exported functions describing purpose and behavior
- Inline comments explain "why" for non-obvious logic (e.g., why certain headers are stripped, why fields are deleted)
- Section separator comments (`// ============`) used in test files

**JSDoc Pattern (from `src/rewriter.ts`):**
```typescript
/**
 * Rewrite identity fields in the API request body.
 *
 * Handles two request types:
 * 1. /v1/messages - rewrite metadata.user_id JSON blob
 * 2. /api/event_logging/batch - rewrite event_data identity/env/process fields
 */
export function rewriteBody(body: Buffer, path: string, config: Config): Buffer {
```

## Function Design

**Size:** Functions are small and focused, typically 10-30 lines. Larger functions like `handleRequest` in `src/proxy.ts` (~120 lines) handle HTTP request lifecycle.

**Parameters:** Pass `Config` object as parameter rather than using global state. Functions receive only what they need.

**Return Values:**
- Synchronous functions return direct values (no wrapping)
- Auth returns `string | null` (name or null for unauthorized)
- Rewriters return `Buffer` (same type as input)
- OAuth uses Promise-based pattern with manual `new Promise()` wrapping Node.js callbacks

**State Management:**
- Module-level mutable state used sparingly: `cachedTokens` in `src/oauth.ts`, `tokenMap` in `src/auth.ts`, `currentLevel` in `src/logger.ts`
- State initialized via explicit `init*()` functions called at startup

## Module Design

**Exports:** Only export functions/types needed by other modules. Internal helpers remain unexported.

**Barrel Files:** Not used. Each module imported directly by path.

**Module Boundaries:**
- `src/config.ts` - Config loading and types (no side effects)
- `src/auth.ts` - Client authentication (stateful, needs `initAuth()`)
- `src/oauth.ts` - OAuth token lifecycle (stateful, needs `initOAuth()`)
- `src/rewriter.ts` - Pure request rewriting (stateless, takes Config param)
- `src/proxy.ts` - HTTP server and request handling (orchestrator)
- `src/logger.ts` - Logging utilities (stateful log level)

## Dependencies

**Minimal dependency philosophy:** Only one runtime dependency (`yaml` for config parsing). Everything else uses Node.js built-ins (`http`, `https`, `fs`, `crypto`, `url`).

---

*Convention analysis: 2026-04-02*

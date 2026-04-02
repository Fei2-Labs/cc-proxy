# Phase 1: Foundation & Admin Auth - Research

**Researched:** 2026-04-02
**Status:** Complete

## 1. Next.js Custom Server Integration

### Approach: Custom Server with Request Interception

Next.js supports a custom server pattern where you create an HTTP server, intercept requests, and delegate to Next.js for portal routes while handling proxy routes directly.

**Pattern:**
```typescript
import { createServer } from 'http'
import next from 'next'

const app = next({ dev, dir: './portal' })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer((req, res) => {
    if (isPortalRoute(req.url)) {
      handle(req, res)  // Next.js handles portal
    } else {
      handleProxy(req, res)  // Existing proxy logic
    }
  }).listen(port)
})
```

**Key findings:**
- `next()` accepts `dir` option to point at the Next.js app directory (we'll use `portal/`)
- `httpServer` option can pass the server instance to Next.js
- Custom server file (`server.ts`) runs outside Next.js compiler — must be compatible with Node.js directly
- `output: 'standalone'` in next.config.js does NOT work with custom servers — we skip it
- Portal routes: anything starting with `/portal`, `/_next` (Next.js assets), `/api/portal`
- All other routes: existing proxy behavior (forwarded to Anthropic)

**Decision: App Router vs Pages Router**
- Use App Router (`app/` directory) — it's the modern default, supports React Server Components, and route handlers via `route.ts` files
- Portal API routes use Next.js Route Handlers (`app/api/...`) for auth endpoints
- No need for Pages Router — App Router covers all requirements

### Directory Structure

```
cc-proxy/
├── src/                    # Existing proxy code (unchanged)
├── portal/                 # Next.js app (new)
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── portal/
│   │   │   ├── layout.tsx      # Authenticated shell with sidebar
│   │   │   ├── page.tsx        # Dashboard (placeholder)
│   │   │   ├── tokens/page.tsx # Placeholder
│   │   │   ├── oauth/page.tsx  # Placeholder
│   │   │   ├── usage/page.tsx  # Placeholder
│   │   │   └── logs/page.tsx   # Placeholder
│   │   ├── login/page.tsx      # Login page
│   │   └── api/
│   │       └── auth/
│   │           ├── login/route.ts
│   │           └── me/route.ts
│   ├── next.config.js
│   ├── tailwind.config.ts
│   └── tsconfig.json
├── server.ts               # New entry point (custom server)
└── package.json            # Updated with Next.js deps
```

**Why `portal/` subdirectory:**
- Keeps Next.js config isolated from the proxy's tsconfig.json
- Avoids conflicts between proxy's ESM/bundler resolution and Next.js's own compilation
- Clean separation — proxy code stays in `src/`, portal code in `portal/`

## 2. SQLite with better-sqlite3

### Library Choice: better-sqlite3

**Why better-sqlite3 over alternatives:**
- Synchronous API — simpler code, no async overhead for single-user admin tool
- Fastest SQLite binding for Node.js (native C++ addon)
- Zero runtime dependencies
- WAL mode support for concurrent reads
- Well-maintained, 1M+ weekly downloads

**Why NOT drizzle-orm:**
- Adds ORM abstraction layer unnecessary for ~3 tables
- Extra build complexity
- better-sqlite3 with raw SQL is sufficient and matches the project's minimal-dependency philosophy

### Schema Design

```sql
-- Settings table for key-value config (OAuth tokens, admin password hash, etc.)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Future tables (Phase 2+): tokens, usage_logs
```

Phase 1 only needs the `settings` table for storing the admin password hash (if we want to support changing it later) and JWT signing key. However, per D-03, the admin password comes from `ADMIN_PASSWORD` env var, so the settings table is primarily for the JWT signing secret.

**Database location:** `./data/cc-proxy.db` (configurable via `PORTAL_DATA_DIR` env var or config). Created on first startup with `mkdir -p`.

### Initialization Pattern

```typescript
import Database from 'better-sqlite3'

export function initDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  return db
}
```

## 3. JWT Authentication

### Implementation

**Library: jose**
- Modern, standards-compliant JWT library
- Works with Node.js built-in crypto
- Supports HS256 (HMAC-SHA256) — sufficient for single-admin use
- No native dependencies (unlike jsonwebtoken)

**Flow:**
1. Admin submits password to `POST /api/auth/login`
2. Server compares against `ADMIN_PASSWORD` env var (constant-time comparison)
3. On match, sign JWT with HS256 using a server-generated secret
4. Set JWT in `httpOnly`, `secure`, `sameSite=lax` cookie named `cc-session`
5. JWT payload: `{ role: 'admin', iat, exp }` — no user ID needed (single admin)
6. Expiry: 7 days (reasonable for admin tool)

**Signing key derivation:**
- Generate a random 256-bit key on first startup, store in SQLite `settings` table
- If key exists in DB, reuse it (sessions survive restarts)
- If DB is wiped, all sessions invalidate (acceptable)

**Auth middleware pattern (Next.js):**
- Next.js middleware (`portal/middleware.ts`) checks cookie on every `/portal/*` request
- If no valid JWT → redirect to `/login`
- `/login` and `/api/auth/*` routes are public
- API routes verify JWT and return 401 if invalid

## 4. Portal UI Architecture

### Stack: Tailwind CSS v4 + shadcn/ui

**Why Tailwind + shadcn/ui:**
- Tailwind: utility-first CSS, perfect for dark theme, zero runtime
- shadcn/ui: copy-paste components (not a dependency), customizable, built on Radix UI
- Both are standard for Vercel/Railway-style dashboards (matches D-05 aesthetic)

**Dark theme approach:**
- Set `dark` class on `<html>` element (Tailwind dark mode)
- Use CSS variables for theme colors (shadcn/ui pattern)
- Color palette: zinc/slate grays, blue accents (Vercel-inspired)

### Layout Structure

```
┌─────────────────────────────────────────────┐
│ Sidebar (240px)  │  Main Content            │
│                  │                           │
│ ┌──────────────┐ │  ┌─────────────────────┐ │
│ │ CC Proxy     │ │  │ Page Header         │ │
│ │ logo/title   │ │  │                     │ │
│ ├──────────────┤ │  ├─────────────────────┤ │
│ │ ◆ Dashboard  │ │  │                     │ │
│ │ ○ Tokens     │ │  │  Page Content       │ │
│ │ ○ OAuth      │ │  │  (placeholder)      │ │
│ │ ○ Usage      │ │  │                     │ │
│ │ ○ Logs       │ │  │                     │ │
│ ├──────────────┤ │  │                     │ │
│ │ Logout       │ │  │                     │ │
│ └──────────────┘ │  └─────────────────────┘ │
└─────────────────────────────────────────────┘
```

**Sidebar navigation items (per D-06):**
- Dashboard (home icon) — active in this phase
- Tokens (key icon) — placeholder
- OAuth (shield icon) — placeholder
- Usage (bar-chart icon) — placeholder
- Logs (file-text icon) — placeholder

**Icons:** lucide-react (standard with shadcn/ui)

## 5. Build & Development Setup

### Package.json Changes

New dependencies:
- `next` — framework
- `react`, `react-dom` — React
- `better-sqlite3` — SQLite
- `jose` — JWT
- `tailwindcss`, `@tailwindcss/postcss` — styling
- `lucide-react` — icons
- `clsx`, `tailwind-merge` — utility (shadcn/ui pattern)

Dev dependencies:
- `@types/better-sqlite3` — types
- `@types/react`, `@types/react-dom` — types

### Build Scripts

```json
{
  "build": "tsc && next build portal",
  "start": "node dist/server.js",
  "dev": "tsx watch server.ts"
}
```

**Build produces:**
- `dist/` — compiled proxy TypeScript (existing)
- `portal/.next/` — compiled Next.js app

### Entry Point Migration

Current: `src/index.ts` → `dist/index.js`
New: `server.ts` → `dist/server.js` (custom server that boots both proxy + Next.js)

The existing `src/index.ts` becomes unused in favor of `server.ts`. The proxy logic in `src/proxy.ts` is refactored to export a request handler function instead of creating its own server.

## 6. Config Extension

### New Environment Variables

```
ADMIN_PASSWORD=<required>     # Admin login password (D-03)
PORTAL_PORT=<optional>        # Override port (default: same as proxy port)
```

The existing `config.yaml` remains for proxy config. Portal config uses env vars (simpler for Docker deployment, matches D-03).

### Config Validation

On startup, if `ADMIN_PASSWORD` is not set:
- Log warning: "ADMIN_PASSWORD not set — portal login disabled"
- Portal routes return 503 "Portal not configured"
- Proxy continues to function normally

## 7. Docker Considerations

### Updated Dockerfile Strategy

```dockerfile
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:22-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/portal/.next ./portal/.next
COPY --from=builder /app/portal/public ./portal/public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 8443
CMD ["node", "dist/server.js"]
```

**Note:** better-sqlite3 is a native addon — the builder and runtime stages must use the same platform/architecture. `node:22-slim` works for both.

## 8. Risk Assessment

### Risk: Next.js adds significant bundle size
- **Mitigation:** Portal is admin-only, not user-facing. Bundle size is acceptable.
- **Impact:** Docker image grows from ~150MB to ~400MB. Acceptable for VPS deployment.

### Risk: better-sqlite3 native addon compilation
- **Mitigation:** Prebuilt binaries available for linux/amd64 (Docker target). Falls back to compilation if needed.
- **Impact:** Low — standard Node.js native addon pattern.

### Risk: Custom server loses Automatic Static Optimization
- **Mitigation:** Portal pages are all dynamic (require auth check). No static pages to optimize.
- **Impact:** None — all portal routes are server-rendered or client-rendered behind auth.

## Validation Architecture

### Testable Boundaries

1. **Auth flow:** POST /api/auth/login with correct/incorrect password → verify JWT cookie set/not set
2. **Session persistence:** Set JWT cookie → GET /portal → verify 200 (not redirect to login)
3. **Auth guard:** No cookie → GET /portal → verify redirect to /login
4. **SQLite init:** Start server → verify data/cc-proxy.db exists with settings table
5. **Proxy passthrough:** Non-portal request → verify forwarded to upstream (existing behavior preserved)

### Verification Commands

```bash
# Auth flow
curl -c cookies.txt -X POST http://localhost:8443/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"test"}' | grep -q '"ok":true'

# Session check
curl -b cookies.txt http://localhost:8443/portal -o /dev/null -w '%{http_code}' | grep -q '200'

# Auth guard
curl http://localhost:8443/portal -o /dev/null -w '%{redirect_url}' | grep -q '/login'

# DB exists
test -f data/cc-proxy.db && sqlite3 data/cc-proxy.db ".tables" | grep -q 'settings'

# Proxy passthrough
curl http://localhost:8443/_health | grep -q '"status"'
```

---

## RESEARCH COMPLETE

*Phase: 01-foundation-admin-auth*
*Research completed: 2026-04-02*

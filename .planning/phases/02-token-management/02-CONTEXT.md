# Phase 2: Token Management - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a web UI for creating and listing client bearer tokens, backed by SQLite, with hot-reload so new tokens work immediately without restarting the proxy. After this phase, admin can manage tokens entirely through the portal.

</domain>

<decisions>
## Implementation Decisions

### Token Storage
- **D-01:** Fully migrate tokens from config.yaml to SQLite. On first startup, import any config.yaml tokens into the DB. After that, DB is the sole source of truth.
- **D-02:** Store SHA-256 hash of token in DB, not plaintext. Compare by hashing incoming bearer token. Addresses security concern from codebase audit.
- **D-03:** Token table schema: `id` (INTEGER PRIMARY KEY), `name` (TEXT UNIQUE), `token_hash` (TEXT), `token_prefix` (TEXT, first 8 chars for display), `active` (INTEGER DEFAULT 1), `last_used_at` (TEXT), `created_at` (TEXT DEFAULT datetime('now')).

### Token Display
- **D-04:** Show raw token value once on creation (with copy-to-clipboard button). After that, only name, prefix, status, and last-used time are visible. GitHub PAT style.

### Hot-Reload Mechanism
- **D-05:** Read tokens from SQLite on every auth check. `better-sqlite3` is synchronous and fast — no polling, no events, no cache invalidation needed. Simplest approach.
- **D-06:** Refactor `src/auth.ts` to query SQLite instead of reading from the in-memory Map populated from config.yaml.

### UI Design
- **D-07:** Tokens page follows Phase 1 dark minimal theme. Table layout showing: name, token prefix (e.g., `cc_a1b2c3d4...`), status badge (active/inactive), last used timestamp.
- **D-08:** "Create Token" button opens inline form (not modal) — enter name, click create, see the full token once.

### Claude's Discretion
- API route structure for token CRUD
- Token generation algorithm (random bytes, prefix format)
- Table component styling details
- Config.yaml import logic specifics

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Codebase
- `src/auth.ts` — Current token auth logic (in-memory Map from config). Must be refactored to read from SQLite.
- `src/db.ts` — Database module. Needs tokens table added to schema.
- `src/config.ts` — Config types including `TokenEntry`. Token import logic reads from here.
- `portal/app/portal/tokens/page.tsx` — Current placeholder page to be replaced.
- `.planning/codebase/CONVENTIONS.md` — Coding conventions

### Project
- `.planning/PROJECT.md` — Anti-suspension constraints
- `.planning/REQUIREMENTS.md` — TKN-01, TKN-02, TKN-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/auth.ts` — `authenticate()` function. Needs refactoring from Map lookup to SQLite query + hash comparison.
- `src/db.ts` — `getDatabase()`, `getSetting()`, `setSetting()`. Token table will be added to the SCHEMA constant.
- `portal/lib/utils.ts` — `cn()` utility for Tailwind class merging.
- `portal/components/sidebar.tsx` — Sidebar already has Tokens nav item pointing to `/portal/tokens`.

### Established Patterns
- API routes in `portal/app/api/` (auth routes exist as reference)
- Dark theme CSS variables in `portal/app/globals.css`
- Client components with `'use client'` directive for interactive UI

### Integration Points
- `src/auth.ts:initAuth()` — Called by `createProxyHandler()` in proxy.ts. Must be updated to use SQLite.
- `src/db.ts:SCHEMA` — Add tokens table creation SQL.
- `server.ts` — May need to import config.yaml tokens on first run.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

- Token revocation (TKN-04 in v2 requirements) — not in this phase
- Per-client rate limits (TKN-05 in v2) — not in this phase
- Token expiration dates (TKN-06 in v2) — not in this phase

</deferred>

---

*Phase: 02-token-management*
*Context gathered: 2026-04-02*

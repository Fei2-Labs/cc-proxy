# Phase 1: Foundation & Admin Auth - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a working admin portal shell with SQLite database, password-based login, and session persistence. After this phase, an admin can log in and see an authenticated dashboard skeleton with sidebar navigation. No functional pages yet — those come in later phases.

</domain>

<decisions>
## Implementation Decisions

### Portal Architecture
- **D-01:** Next.js custom server is the single entry point. The existing proxy logic runs as middleware inside the Next.js server. One port, one process, one build.
- **D-02:** All non-portal requests are proxied to Anthropic (existing behavior preserved). Portal routes (pages, API) are handled by Next.js natively.

### Admin Credentials
- **D-03:** Admin password is set via `ADMIN_PASSWORD` environment variable. No config file changes, no setup wizard.

### Session Strategy
- **D-04:** JWT stored in an httpOnly cookie. Stateless auth — no session table in SQLite. Token persists across browser refresh.

### Portal Layout & Design
- **D-05:** Dark theme, minimal aesthetic — developer tool look (Vercel/Railway dashboard style). Clean lines, monospace accents.
- **D-06:** Left sidebar navigation with icons + labels. Pages: Tokens, OAuth, Usage, Logs (placeholder pages in this phase, functional in later phases).

### Claude's Discretion
- Portal architecture details (Next.js custom server setup, middleware integration)
- JWT implementation specifics (expiry time, signing key derivation)
- SQLite schema design
- UI component library choice (shadcn/ui, Tailwind, etc.)
- Dashboard skeleton layout within the sidebar shell

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Codebase
- `.planning/codebase/ARCHITECTURE.md` — Current proxy architecture and data flow
- `.planning/codebase/STACK.md` — Tech stack (Node.js 22, TypeScript, ESM)
- `.planning/codebase/CONVENTIONS.md` — Coding conventions (camelCase, no semicolons, type not interface)
- `.planning/codebase/STRUCTURE.md` — Directory layout and file roles

### Project
- `.planning/PROJECT.md` — Anti-suspension constraints, OAuth protocol requirements
- `.planning/REQUIREMENTS.md` — AUTH-01, AUTH-02 requirements
- `.planning/research/claude-report-raw.txt` — Suspension mechanism report (reference for proxy behavior constraints)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/proxy.ts` — HTTP server creation, request handling, health/verify endpoints. Will need to be adapted to run inside Next.js custom server.
- `src/auth.ts` — Client token authentication logic. Reusable for proxy auth layer.
- `src/config.ts` — Config loading and types. Will need extension for portal config.
- `src/logger.ts` — Logging utility. Can be reused for portal logging.

### Established Patterns
- ESM with `.js` extension imports
- `type` keyword for TypeScript types (not `interface`)
- camelCase functions, UPPER_SNAKE_CASE constants
- No semicolons, 2-space indent, single quotes
- No framework — raw Node.js HTTP. Next.js will be the first framework addition.

### Integration Points
- `src/index.ts` — Current entry point that will be replaced by Next.js custom server
- `src/proxy.ts:startProxy()` — Server creation function that needs to become middleware
- `package.json` — Will need Next.js, React dependencies and build scripts
- `Dockerfile` — Will need multi-stage build update for Next.js
- `config.example.yaml` — May need portal-related config additions

</code_context>

<specifics>
## Specific Ideas

- Dark + minimal aesthetic inspired by Vercel/Railway dashboards
- Sidebar should show: Tokens, OAuth, Usage, Logs as navigation items
- Single Docker image with both proxy and portal (deployment target: Dokploy)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-admin-auth*
*Context gathered: 2026-04-02*

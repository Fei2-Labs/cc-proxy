# Phase 1: Foundation & Admin Auth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 01-foundation-admin-auth
**Areas discussed:** Portal architecture, Admin credentials, Session strategy, Portal layout

---

## Portal Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Next.js as main server with proxy middleware | Single port, single process, Next.js serves portal + proxies API | ✓ |
| Existing proxy serves static React build | Proxy routes /admin/* to static files | |
| Separate processes behind nginx | Two ports, reverse proxy in front | |

**User's choice:** Single port, single process — user explicitly said "only one port, simple"
**Notes:** User rejected multi-port approach immediately. Best practice decision: Next.js custom server wrapping proxy logic as middleware.

---

## Admin Credentials

| Option | Description | Selected |
|--------|-------------|----------|
| Environment variable (ADMIN_PASSWORD) | Simple, Docker/Dokploy secrets compatible | ✓ |
| Config file entry | In config.yaml alongside other settings | |
| First-run setup wizard | Interactive setup on first visit | |

**User's choice:** Claude's discretion — user said "use what's best practice and simple"
**Notes:** Chose env var for Docker/Dokploy compatibility.

---

## Session Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| JWT in httpOnly cookie | Stateless, no session table, persists across refresh | ✓ |
| Server-side sessions in SQLite | Stateful, requires cleanup | |
| Simple token in localStorage | Easy but XSS-vulnerable | |

**User's choice:** Claude's discretion — user said "use what's best practice and simple"
**Notes:** JWT in httpOnly cookie is stateless and secure.

---

## Portal Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Dark + minimal with sidebar nav | Clean dark theme, sidebar navigation | ✓ |
| Light theme with top nav | Traditional admin panel | |
| Dark with top nav | Dark but horizontal navigation | |

**User's choice:** Dark + minimal theme, sidebar navigation
**Notes:** User selected dark minimal aesthetic with sidebar nav.

---

## Claude's Discretion

- Portal architecture details (Next.js custom server approach)
- Admin credentials mechanism (env var)
- Session strategy (JWT httpOnly cookie)

## Deferred Ideas

None — discussion stayed within phase scope

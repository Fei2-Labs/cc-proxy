# Phase 2: Token Management - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 02-token-management
**Areas discussed:** Token storage, Token display, Hot-reload mechanism, UI design

---

## Token Storage

| Option | Description | Selected |
|--------|-------------|----------|
| SQLite only (migrate from config.yaml) | DB is sole source of truth, import config tokens on first run | ✓ |
| Dual source (config.yaml + SQLite) | Both work, config as fallback | |
| Config.yaml only (no migration) | Keep existing approach | |

**User's choice:** Claude's discretion — user said "use what's best practice and simple" in Phase 1
**Notes:** Single source of truth is simpler. SHA-256 hashing addresses security audit finding.

---

## Token Display

| Option | Description | Selected |
|--------|-------------|----------|
| Show once on creation (GitHub PAT style) | Raw token visible only at creation, then only prefix shown | ✓ |
| Always visible | Token always shown in the list | |
| Reveal on click | Hidden by default, click to show | |

**User's choice:** Claude's discretion
**Notes:** Standard security practice. Copy-to-clipboard on creation.

---

## Hot-Reload Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Read from SQLite on every request | Synchronous better-sqlite3 query per auth check | ✓ |
| Poll SQLite periodically | Timer-based cache refresh | |
| Event-based (file watcher or IPC) | Notify proxy of changes | |

**User's choice:** Claude's discretion
**Notes:** better-sqlite3 is synchronous and fast. Simplest approach, no cache invalidation needed.

---

## Claude's Discretion

- All technical decisions for this phase (user preference from Phase 1: "best practice and simple")

## Deferred Ideas

- Token revocation (v2)
- Per-client rate limits (v2)
- Token expiration dates (v2)

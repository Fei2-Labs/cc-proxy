# cc-proxy

## What This Is

A reverse proxy gateway for Claude Code that sits between Claude Code clients and the Anthropic API. It rewrites identity and telemetry fields so multiple clients appear as a single canonical device, manages OAuth tokens centrally, and authenticates clients via bearer tokens. Built for personal/small-team use on a single VPS.

## Core Value

Multiple Claude Code clients share one Anthropic subscription safely, with all identity fields unified to avoid account suspension from multi-device detection.

## Current Milestone: v1.0 Admin Portal

**Goal:** Add a web-based admin portal for managing the proxy, monitoring usage, and troubleshooting — packaged as a Docker image for DockerHub + Dokploy deployment.

**Target features:**
- Token management UI (create, revoke, list client tokens — no restart needed)
- OAuth web setup (browser-based flow, strictly following original Claude Code protocol)
- Usage dashboard (per-request logging with per-client rollups)
- Subscription limits display (Anthropic rate limits and remaining quota)
- Log viewer (filterable by client, time, status)
- Admin auth (password-based login)
- Docker-ready (single image for DockerHub + docker-compose on Dokploy)

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Inferred from existing codebase. -->

- HTTP/HTTPS reverse proxy with request forwarding to api.anthropic.com
- OAuth token lifecycle management (auto-refresh, pre-expiry renewal)
- Client bearer token authentication via config
- Identity rewriting (device_id, email, env fingerprint, process metrics)
- Telemetry event rewriting (/api/event_logging/batch)
- Prompt text rewriting (system prompt environment masking)
- Header normalization (User-Agent, x-anthropic-billing-header with fingerprint)
- Health check endpoint (/_health)
- Verify endpoint for dry-run rewrite testing (/_verify)
- Docker multi-stage build deployment
- YAML-based configuration

### Active

<!-- Current scope. Building toward these in v1.0. -->

- [ ] Web-based token management (create/revoke/list without restart)
- [ ] Browser-based OAuth setup following original Claude Code flow
- [ ] Per-request usage logging (model, tokens in/out, latency, client)
- [ ] Per-client usage dashboard with daily/weekly/monthly rollups
- [ ] Subscription limits and rate limit monitoring
- [ ] Filterable log viewer for troubleshooting
- [ ] Password-based admin authentication
- [ ] Single Docker image deployable via DockerHub + Dokploy

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Multi-account support — Single Anthropic account only; multi-account routing adds complexity and suspension risk
- Client self-service portal — Admin-only access; clients don't need to see usage
- OAuth modification/custom flow — Must follow original Claude Code OAuth protocol exactly to avoid suspension
- Telemetry blocking — Must NOT disable telemetry; blocking makes the proxy more detectable per suspension report
- Mobile app — Web portal only
- Real-time WebSocket dashboard — Polling-based updates sufficient for admin use

## Context

**Suspension risk research (source: Claude Code suspension mechanism report, Mar 2026):**

The proxy's design is validated by the report's findings. Key rules:
1. **Never disable telemetry** — Disabling makes the account stand out. "Blend in like water in the ocean."
2. **Single canonical Device ID** — The proxy already unifies all clients to one Device ID. This is correct.
3. **Preserve all identity headers exactly** — x-anthropic-billing-header (with cc_version + SHA256 fingerprint), User-Agent, x-app, X-Claude-Code-Session-Id
4. **OAuth flow is sacred** — platform.claude.com/v1/oauth/token exchange must be identical to official client
5. **Monitor rate limits** — Anthropic tracks per-account token usage (inputTokens, outputTokens, costUsd, model). Exceeding rateLimitTier quota triggers escalation.
6. **NATIVE_CLIENT_ATTESTATION** — Bun's HTTP stack can inject client attestation tokens (cch=). This is a deeper verification layer to be aware of.

**Top 5 ban triggers (ranked by risk):**
1. Subscription abuse / account sharing (Extreme) — Multiple Device IDs per account
2. Rate limit violations (High) — Exceeding quota, high-frequency calls
3. Content policy violations (High) — Message fingerprint + anti-distillation
4. Automation abuse (Medium) — CI/CD detection, non-interactive mode, abnormal token consumption
5. Unofficial client / tampering (Medium) — Fingerprint verification failure, version header anomalies

**Deployment target:** VPS via Dokploy, Docker image on DockerHub.

## Constraints

- **Anti-suspension**: All proxy behavior must preserve the appearance of a single legitimate Claude Code client. No telemetry blocking, no header tampering beyond canonical identity rewriting.
- **OAuth protocol**: Must use identical OAuth flow as official Claude Code client (platform.claude.com)
- **Deployment**: Must produce a single Docker image suitable for DockerHub publishing and Dokploy docker-compose deployment
- **Stack**: React/Next.js frontend, SQLite for persistence, existing Node.js/TypeScript proxy backend
- **Single process**: Portal and proxy run in the same Docker container

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SQLite for storage | Single-VPS deployment, no external DB needed, zero-ops | -- Pending |
| React/Next.js for portal | Rich dashboard UI, SSR for initial load, familiar ecosystem | -- Pending |
| Password auth for admin | Simplest secure option for single-admin use case | -- Pending |
| Telemetry pass-through | Blocking telemetry increases suspension risk per research | -- Pending |
| Single Docker image | Simplifies Dokploy deployment, one service to manage | -- Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check -- still the right priority?
3. Audit Out of Scope -- reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-02 after milestone v1.0 initialization*

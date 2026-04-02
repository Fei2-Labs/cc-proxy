# Requirements: cc-proxy

**Defined:** 2026-04-02
**Core Value:** Multiple Claude Code clients share one Anthropic subscription safely via unified identity

## v1 Requirements

Requirements for v1.0 Admin Portal milestone. Each maps to roadmap phases.

### Token Management

- [ ] **TKN-01**: Admin can create a new client bearer token with a name via web UI
- [ ] **TKN-02**: Admin can view all tokens with name, status, and last-used time
- [ ] **TKN-03**: Token changes take effect without proxy restart (hot-reload from SQLite)

### OAuth Setup

- [ ] **OAUTH-01**: Admin can initiate OAuth flow via web browser following original Claude Code protocol (platform.claude.com)
- [ ] **OAUTH-02**: OAuth refresh token is stored and used by the proxy automatically
- [ ] **OAUTH-03**: Admin can see current OAuth token status (valid/expired/error)

### Usage Dashboard

- [ ] **USAGE-01**: Every proxied API request is logged to SQLite (model, input/output tokens, latency, client, status)
- [ ] **USAGE-02**: Admin can view per-client usage rollups (daily/weekly/monthly)
- [ ] **USAGE-03**: Admin can see current Anthropic rate limits and remaining quota
- [ ] **USAGE-04**: Admin can see estimated USD cost per client based on token usage

### Log Viewer

- [ ] **LOG-01**: Admin can filter logs by client
- [ ] **LOG-02**: Admin can filter logs by time range
- [ ] **LOG-03**: Admin can filter logs by status (success/error/rate-limited)
- [ ] **LOG-04**: Admin can click a log entry to see full request/response detail

### Admin Auth

- [ ] **AUTH-01**: Portal is protected by password-based login
- [ ] **AUTH-02**: Admin session persists across browser refresh (JWT or session cookie)

### Deployment

- [ ] **DEPLOY-01**: Proxy + portal builds as a single Docker image
- [ ] **DEPLOY-02**: Image is publishable to DockerHub
- [ ] **DEPLOY-03**: Deployable via docker-compose on Dokploy

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Token Management

- **TKN-04**: Admin can revoke/disable a client token
- **TKN-05**: Admin can set per-client rate limits
- **TKN-06**: Admin can set token expiration dates

### Monitoring

- **MON-01**: Real-time WebSocket dashboard updates
- **MON-02**: Usage alerts when approaching rate limits
- **MON-03**: Export usage data as CSV

### Security

- **SEC-01**: Token hashing (store SHA-256 hashes instead of plain text)
- **SEC-02**: Audit log for admin actions

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-account support | Single Anthropic account only; multi-account routing adds complexity and suspension risk |
| Client self-service portal | Admin-only access; clients don't need to see usage |
| Custom OAuth flow | Must follow original Claude Code protocol exactly to avoid suspension |
| Telemetry blocking | Blocking telemetry increases suspension risk per research |
| Mobile app | Web portal only |
| GitHub/OAuth admin login | Password auth is sufficient for single-admin use |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| TKN-01 | Phase 2 | Complete |
| TKN-02 | Phase 2 | Complete |
| TKN-03 | Phase 2 | Complete |
| OAUTH-01 | Phase 3 | Complete |
| OAUTH-02 | Phase 3 | Complete |
| OAUTH-03 | Phase 3 | Complete |
| USAGE-01 | Phase 4 | Complete |
| USAGE-02 | Phase 5 | Pending |
| USAGE-03 | Phase 5 | Pending |
| USAGE-04 | Phase 5 | Pending |
| LOG-01 | Phase 6 | Pending |
| LOG-02 | Phase 6 | Pending |
| LOG-03 | Phase 6 | Pending |
| LOG-04 | Phase 6 | Pending |
| DEPLOY-01 | Phase 7 | Pending |
| DEPLOY-02 | Phase 7 | Pending |
| DEPLOY-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after roadmap creation*

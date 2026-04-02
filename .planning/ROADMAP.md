# Roadmap: cc-proxy

## Overview

The v1.0 Admin Portal milestone adds a web-based management layer on top of the existing reverse proxy. The work proceeds in dependency order: database foundation and admin authentication come first so every subsequent phase has a secure, persistent base to build on. Token management and OAuth setup deliver the two core operational capabilities. Usage logging must exist before the dashboard can display data, and the log viewer builds on the same logged data. Deployment packaging comes last, after all features are verified working together.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Admin Auth** - SQLite database, Next.js portal scaffold, and password-based admin login
- [x] **Phase 2: Token Management** - Web UI to create, list, and hot-reload client bearer tokens
- [ ] **Phase 3: OAuth Web Setup** - Browser-based OAuth flow following the official Claude Code protocol
- [ ] **Phase 4: Usage Logging** - Per-request logging pipeline writing model, tokens, latency, and client to SQLite
- [ ] **Phase 5: Usage Dashboard** - Per-client rollups, rate limit display, and estimated cost view
- [ ] **Phase 6: Log Viewer** - Filterable, drillable request log UI for troubleshooting
- [ ] **Phase 7: Deployment** - Single Docker image build, DockerHub publish, and Dokploy docker-compose

## Phase Details

### Phase 1: Foundation & Admin Auth
**Goal**: Admin can securely log into a working portal backed by SQLite
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02
**Success Criteria** (what must be TRUE):
  1. Admin can navigate to the portal URL and see a login page
  2. Admin can log in with the configured password and reach a protected dashboard shell
  3. Admin session persists across browser refresh without re-entering the password
  4. Unauthenticated requests to portal routes redirect to the login page
  5. SQLite database is initialized on first startup with the required schema
**Plans**: TBD
**UI hint**: yes

### Phase 2: Token Management
**Goal**: Admin can create and view client bearer tokens that take effect without restarting the proxy
**Depends on**: Phase 1
**Requirements**: TKN-01, TKN-02, TKN-03
**Success Criteria** (what must be TRUE):
  1. Admin can create a new client token by entering a name in the web UI and immediately sees it in the token list
  2. Token list shows each token's name, status, and last-used timestamp
  3. A newly created token is accepted by the proxy for API requests without restarting the proxy process
**Plans**: TBD
**UI hint**: yes

### Phase 3: OAuth Web Setup
**Goal**: Admin can complete the Anthropic OAuth flow through the browser and the proxy uses the resulting token automatically
**Depends on**: Phase 1
**Requirements**: OAUTH-01, OAUTH-02, OAUTH-03
**Success Criteria** (what must be TRUE):
  1. Admin can start the OAuth flow from the portal and is redirected to platform.claude.com using the official Claude Code protocol
  2. After completing the OAuth flow, the refresh token is stored in SQLite and used automatically by the proxy
  3. Admin can see the current OAuth token status (valid, expired, or error) on the portal
**Plans**: TBD
**UI hint**: yes

### Phase 4: Usage Logging
**Goal**: Every proxied API request is recorded to SQLite with enough detail to power the dashboard and log viewer
**Depends on**: Phase 1
**Requirements**: USAGE-01
**Success Criteria** (what must be TRUE):
  1. After making an API request through the proxy, a log entry appears in SQLite with model, input tokens, output tokens, latency, client ID, and status
  2. Logging does not disrupt or slow proxy request forwarding when the database is unavailable
**Plans**: TBD

### Phase 5: Usage Dashboard
**Goal**: Admin can understand per-client usage, costs, and rate limit headroom at a glance
**Depends on**: Phase 4
**Requirements**: USAGE-02, USAGE-03, USAGE-04
**Success Criteria** (what must be TRUE):
  1. Admin can view a dashboard showing each client's token usage rolled up by day, week, and month
  2. Admin can see current Anthropic rate limits alongside remaining quota for the account
  3. Admin can see an estimated USD cost per client calculated from logged token counts
**Plans**: TBD
**UI hint**: yes

### Phase 6: Log Viewer
**Goal**: Admin can find and inspect individual requests by filtering on client, time, and status
**Depends on**: Phase 4
**Requirements**: LOG-01, LOG-02, LOG-03, LOG-04
**Success Criteria** (what must be TRUE):
  1. Admin can filter the log list by client and see only that client's requests
  2. Admin can filter logs by a time range and see only requests within that window
  3. Admin can filter logs by status (success, error, rate-limited) and see matching entries
  4. Admin can click any log entry and see the full request and response detail
**Plans**: TBD
**UI hint**: yes

### Phase 7: Deployment
**Goal**: The proxy and portal run together in a single Docker image that can be published and deployed via Dokploy
**Depends on**: Phase 6
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03
**Success Criteria** (what must be TRUE):
  1. Running `docker build` produces a single image containing both the proxy and the Next.js portal
  2. The image can be pushed to DockerHub and pulled on a fresh machine with all features working
  3. A docker-compose file deploys the image on Dokploy with correct port, volume, and environment configuration
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Admin Auth | 3/3 | Complete | 2026-04-02 |
| 2. Token Management | 0/TBD | Not started | - |
| 3. OAuth Web Setup | 0/TBD | Not started | - |
| 4. Usage Logging | 0/TBD | Not started | - |
| 5. Usage Dashboard | 0/TBD | Not started | - |
| 6. Log Viewer | 0/TBD | Not started | - |
| 7. Deployment | 0/TBD | Not started | - |

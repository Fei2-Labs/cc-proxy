# Phase 3: OAuth Web Setup - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a browser-based OAuth flow so the admin can obtain the Anthropic refresh token through the portal UI. Store the refresh token in SQLite. Show OAuth status (valid/expired/error) on the portal. After this phase, the admin never needs to manually extract tokens from `~/.claude/.credentials.json`.

</domain>

<decisions>
## Implementation Decisions

### OAuth Flow
- **D-01:** Use the exact same OAuth protocol as Claude Code: `platform.claude.com/v1/oauth/token`, same `CLIENT_ID` (`9d1c250a-e61b-44d9-88ed-5944d1962f5e`), same scopes. No modifications.
- **D-02:** OAuth Authorization Code flow with PKCE: portal generates code_verifier/challenge, redirects to Anthropic's authorize endpoint, receives callback with auth code, exchanges for tokens.
- **D-03:** Refresh token stored in SQLite settings table (key: `oauth_refresh_token`). On startup, check SQLite first, fall back to config.yaml.

### Token Lifecycle
- **D-04:** Refactor `src/oauth.ts` to accept refresh token from either SQLite or config. When a new refresh token is obtained via web flow, store in SQLite and reinitialize the OAuth manager.
- **D-05:** OAuth status exposed via API endpoint: `GET /api/oauth/status` returns `{status: "valid"|"expired"|"error"|"not_configured", expiresAt}`.

### UI
- **D-06:** OAuth page shows current status (green/red/yellow badge) and a "Connect" button to start the flow. After successful auth, status updates to show valid token with expiry.

### Claude's Discretion
- PKCE implementation details
- Callback URL handling
- Error recovery flow

</decisions>

<canonical_refs>
## Canonical References

- `src/oauth.ts` — Current OAuth token lifecycle (CLIENT_ID, TOKEN_URL, scopes, refresh logic)
- `src/db.ts` — SQLite settings table for storing refresh token
- `src/config.ts` — Config types, oauth.refresh_token field
- `server.ts` — Server entry point, OAuth initialization
- `.planning/PROJECT.md` — Anti-suspension constraints (must follow original protocol)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/oauth.ts` — `initOAuth()`, `getAccessToken()`, `refreshOAuthToken()`. Core refresh logic reusable, needs to accept token from SQLite.
- `src/db.ts` — `getSetting()`, `setSetting()` for storing refresh token.
- `portal/lib/auth.ts` — Session verification for protecting OAuth endpoints.

### Integration Points
- `server.ts:initOAuth(config.oauth.refresh_token)` — Must check SQLite first, then config.yaml fallback.
- `src/oauth.ts` — Needs new `reinitOAuth()` function to swap refresh token at runtime.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-oauth-web-setup*
*Context gathered: 2026-04-02*

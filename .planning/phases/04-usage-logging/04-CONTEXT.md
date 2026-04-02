# Phase 4: Usage Logging - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Add per-request logging to SQLite. Every proxied API request records model, input/output tokens, latency, client name, status code, and request path. Logging must not disrupt proxy forwarding. This data powers Phase 5 (dashboard) and Phase 6 (log viewer).

</domain>

<decisions>
## Implementation Decisions

### Logging Strategy
- **D-01:** Intercept the upstream response to extract usage data (model, tokens). For streaming SSE responses, buffer the last few events to capture the `message_stop` event which contains `usage`. For non-streaming, parse the response body.
- **D-02:** Log asynchronously — write to SQLite after the response is fully piped to the client. Never block the response stream.
- **D-03:** Wrap logging in try/catch — failures are logged to console but never affect the proxy response.

### Schema
- **D-04:** `request_logs` table: `id`, `client_name`, `method`, `path`, `model`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `status`, `latency_ms`, `created_at`.

### Claude's Discretion
- SSE parsing implementation details
- Whether to use a Transform stream or buffer approach for capturing usage from streamed responses

</decisions>

<canonical_refs>
## Canonical References

- `src/proxy.ts` — Request handling, upstream forwarding, response piping
- `src/db.ts` — Database module, add request_logs table
- `.planning/REQUIREMENTS.md` — USAGE-01

</canonical_refs>

---

*Phase: 04-usage-logging*
*Context gathered: 2026-04-02*

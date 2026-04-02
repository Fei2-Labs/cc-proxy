# Codebase Concerns

**Analysis Date:** 2026-04-02

## Tech Debt

**No Request Size Limit:**
- Issue: `src/proxy.ts` (lines 102-106) collects the entire request body into memory with no size cap. A malicious or buggy client can send an unbounded payload, exhausting gateway memory.
- Files: `src/proxy.ts`
- Impact: Denial of service; the gateway process crashes from OOM.
- Fix approach: Add a configurable max body size (e.g., 10 MB). Abort the request with 413 if exceeded. Track accumulated `chunks` size in the `for await` loop.

**No Request Timeout:**
- Issue: There is no timeout on upstream requests in `src/proxy.ts`. If the Anthropic API hangs, the gateway holds the connection open indefinitely, leaking resources.
- Files: `src/proxy.ts`
- Impact: Connection exhaustion under upstream degradation.
- Fix approach: Set a `timeout` option on the `httpsRequest` call (e.g., 120s for streaming responses) and handle the `'timeout'` event by destroying the socket and returning 504.

**Custom Test Harness Instead of Real Framework:**
- Issue: `tests/rewriter.test.ts` uses a hand-rolled `test()` function with manual pass/fail counting instead of a proper test runner (vitest, jest, node:test).
- Files: `tests/rewriter.test.ts`, `package.json` (script: `"test": "tsx tests/rewriter.test.ts"`)
- Impact: No watch mode, no parallel execution, no coverage reporting, no structured output. Adding tests is friction-heavy.
- Fix approach: Migrate to `vitest` (already ESM-native, pairs well with `tsx`). The existing assertions use `node:assert` which vitest supports.

**No Config Validation Beyond Minimal Checks:**
- Issue: `src/config.ts` validates only `identity.device_id`, `auth.tokens`, and `oauth.refresh_token`. Other required fields (`server.port`, `upstream.url`, `env.*`, `prompt_env.*`, `process.*`) are not validated. A missing or malformed field causes a runtime crash deep in the proxy/rewriter instead of a clear startup error.
- Files: `src/config.ts`
- Impact: Hard-to-diagnose runtime errors from incomplete config.
- Fix approach: Add validation for all required config sections at startup. Consider using a schema validation library (zod is lightweight) or at minimum add manual checks for `server.port`, `upstream.url`, `prompt_env`, and `process` ranges.

**Hardcoded OAuth Client ID and Scopes:**
- Issue: `src/oauth.ts` hardcodes `CLIENT_ID` and `DEFAULT_SCOPES` as constants. If Anthropic rotates the client ID or changes scope requirements, the code must be updated and redeployed.
- Files: `src/oauth.ts` (lines 4-10)
- Impact: Breakage when upstream changes OAuth parameters.
- Fix approach: Move `client_id` and `scopes` into `config.yaml` under the `oauth` section, with current values as defaults.

## Security Considerations

**Plain-Text Bearer Tokens (No Hashing):**
- Risk: Auth tokens in `config.yaml` are stored and compared as plain text. If the config file is leaked (backup, logs, accidental commit), all client tokens are exposed.
- Files: `src/auth.ts`, `src/config.ts`
- Current mitigation: `config.yaml` is in `.gitignore`.
- Recommendations: Store token hashes (SHA-256) in config instead of raw tokens. Hash the incoming bearer token before lookup. This way a leaked config does not directly expose usable tokens.

**No Rate Limiting:**
- Risk: A compromised client token can make unlimited requests. The gateway provides no per-client or global rate limiting.
- Files: `src/proxy.ts`
- Current mitigation: None.
- Recommendations: Add configurable per-client rate limiting (e.g., requests per minute). Track request counts in a simple in-memory map keyed by client name.

**Health Endpoint Leaks Client Names:**
- Risk: `/_health` endpoint (no auth required) returns the list of authorized client names in the `clients` field. This reveals information about the gateway's user base to unauthenticated callers.
- Files: `src/proxy.ts` (lines 54-67)
- Current mitigation: None.
- Recommendations: Remove the `clients` field from the health response, or require auth for the full health payload.

**No TLS Certificate Validation for Upstream:**
- Risk: The proxy uses `httpsRequest` to talk to upstream but does not explicitly configure certificate verification. While Node.js verifies TLS by default, there is no option to pin certificates or enforce minimum TLS versions.
- Files: `src/proxy.ts` (line 129)
- Current mitigation: Node.js default TLS verification.
- Recommendations: Consider adding `minVersion: 'TLSv1.2'` to upstream request options. Low priority since defaults are secure.

**OAuth Refresh Token in Config File:**
- Risk: The refresh token grants full account access and sits in `config.yaml` on disk.
- Files: `config.example.yaml`, `src/config.ts`
- Current mitigation: `config.yaml` is gitignored; Docker mounts it read-only.
- Recommendations: Support reading the refresh token from an environment variable as an alternative to the config file, enabling secrets management via Docker secrets or vault injection.

## Performance Bottlenecks

**Full Body Parse and Re-Serialize on Every Request:**
- Problem: `src/rewriter.ts` parses every request body as JSON, rewrites fields, then re-serializes. For large message payloads (multi-turn conversations with long contexts), this adds latency and memory pressure.
- Files: `src/rewriter.ts` (line 11-33)
- Cause: The rewriter needs deep access to nested JSON fields (`metadata.user_id`, `system[].text`, `messages[].content`).
- Improvement path: This is inherent to the approach. For optimization, consider streaming JSON rewriting for the `/api/event_logging/batch` path (events can be large batches). For `/v1/messages`, the current approach is acceptable since the body is needed in full for content rewriting.

**Regex-Based Prompt Rewriting:**
- Problem: `rewritePromptText` applies 5 regex replacements per text block, and this runs on every system prompt item and every user message content block.
- Files: `src/rewriter.ts` (lines 90-136)
- Cause: Multiple independent regex patterns applied sequentially.
- Improvement path: Combine related patterns where possible. For most payloads this is negligible, but for conversations with many messages it compounds. Low priority.

## Fragile Areas

**Prompt Rewriting Regex Patterns:**
- Files: `src/rewriter.ts` (lines 90-136)
- Why fragile: The regex patterns (e.g., `/Platform:\s*\S+/g`, `/\/(?:Users|home)\/[^/\s]+\//g`) are tightly coupled to the exact format of Claude Code's system prompts. If Anthropic changes the prompt format (e.g., different casing, different env block structure, new fields), identity data will leak through unrewritten.
- Safe modification: Always add new regex patterns rather than modifying existing ones. Test against real captured payloads. The `/_verify` endpoint helps validate rewrites.
- Test coverage: `tests/rewriter.test.ts` covers the main patterns but does not test edge cases like multi-line working directory paths, Windows-style paths (`C:\Users\...` in the regex but not tested), or nested env blocks.

**OAuth Token Refresh Chain:**
- Files: `src/oauth.ts` (lines 36-55)
- Why fragile: Uses recursive `setTimeout` for token refresh scheduling. If the refresh token itself is rotated by the server (line 49: `cachedTokens.refreshToken || refreshToken`), the fallback logic silently uses the original token if the new one is empty/undefined. An error in refresh retries after 30s with a fixed delay, but there is no exponential backoff or max retry limit.
- Safe modification: Test OAuth error paths manually. The retry logic should add backoff and a circuit breaker (e.g., stop retrying after N failures and mark gateway degraded).
- Test coverage: Zero -- `src/oauth.ts` has no test coverage at all.

**Upstream Response Streaming:**
- Files: `src/proxy.ts` (lines 139-154)
- Why fragile: The `transfer-encoding` header is deleted from responses (line 143) but `content-length` is not added. For streamed SSE responses this is fine, but for non-streamed responses the client may not know when the body ends.
- Safe modification: Only delete `transfer-encoding` if the response is being piped (SSE). For non-SSE responses, preserve original headers.
- Test coverage: No tests for the proxy layer at all.

## Scaling Limits

**Single-Process Architecture:**
- Current capacity: One Node.js process handles all connections.
- Limit: Limited to ~10K concurrent connections on a single process (depends on payload sizes and upstream latency). No horizontal scaling support.
- Scaling path: Run multiple gateway instances behind a load balancer. The gateway is stateless except for the in-memory OAuth token cache, which each instance manages independently. Consider adding cluster mode or moving to a proper reverse proxy (nginx + auth module) for higher scale.

**In-Memory Token Map:**
- Current capacity: Supports hundreds of client tokens easily.
- Limit: All tokens must be in the config file; no dynamic token management.
- Scaling path: For many clients, consider a database-backed token store with an admin API for token CRUD.

## Dependencies at Risk

**Minimal Dependency Surface (Low Risk):**
- The project has only one production dependency (`yaml` ^2.7.0), which is a well-maintained, widely-used library. The attack surface is minimal.
- Risk: Very low. The `yaml` package is stable and actively maintained.

**Node.js Built-in HTTP/HTTPS:**
- Risk: Using raw `http`/`https` modules means no automatic retry, connection pooling, keep-alive management, or circuit breaking for upstream requests.
- Impact: Under load or upstream instability, the gateway may create excessive connections or fail ungracefully.
- Migration plan: Consider using `undici` (Node.js built-in fetch backend) for connection pooling and better HTTP/2 support. This would also simplify the proxy code.

## Missing Critical Features

**No Graceful Shutdown:**
- Problem: `src/index.ts` and `src/proxy.ts` do not handle `SIGTERM` or `SIGINT`. When the process is stopped (Docker stop, Ctrl+C), in-flight requests are abruptly terminated.
- Blocks: Clean Docker container restarts; may cause incomplete responses to clients.

**No Connection Keep-Alive to Upstream:**
- Problem: Every proxied request creates a new TCP+TLS connection to `api.anthropic.com`. There is no HTTP agent with keep-alive or connection pooling.
- Files: `src/proxy.ts` (line 129)
- Blocks: Efficient high-throughput proxying. Each request pays full TLS handshake cost.

**No Structured Logging:**
- Problem: `src/logger.ts` outputs plain text with manual formatting. No JSON structured logging for log aggregation tools.
- Files: `src/logger.ts`
- Blocks: Integration with log management platforms (ELK, Datadog, etc.).

## Test Coverage Gaps

**Proxy Layer Untested:**
- What's not tested: The entire HTTP proxy flow -- request handling, auth integration, upstream forwarding, error responses, health/verify endpoints.
- Files: `src/proxy.ts`
- Risk: Regressions in request forwarding, header handling, or error paths go undetected.
- Priority: High

**OAuth Module Untested:**
- What's not tested: Token refresh, expiry scheduling, error recovery, token rotation handling.
- Files: `src/oauth.ts`
- Risk: OAuth failures (token rotation, network errors, invalid responses) are only discovered in production.
- Priority: High

**Auth Module Untested:**
- What's not tested: Token matching, header parsing (`Authorization` vs `Proxy-Authorization`), edge cases (malformed headers, empty tokens).
- Files: `src/auth.ts`
- Risk: Auth bypass edge cases could go unnoticed.
- Priority: Medium

**Config Validation Untested:**
- What's not tested: Config loading, validation logic, error messages for invalid config.
- Files: `src/config.ts`
- Risk: Invalid configs may pass validation or produce unhelpful error messages.
- Priority: Low

---

*Concerns audit: 2026-04-02*

# Anthropic Unified Rate Limit Investigation

**Date**: 2026-04-03 (Updated with deep research)
**Context**: Proxy returning 429 for Opus/Sonnet while Haiku works. Direct Claude Code session uses Opus fine.

---

## Table of Contents

1. [Rate Limit Architecture](#1-rate-limit-architecture)
2. [Unified Rate Limit Headers](#2-unified-rate-limit-headers)
3. [Billing Header Algorithm](#3-billing-header-algorithm)
4. [Native Client Attestation](#4-native-client-attestation)
5. [Telemetry & Fingerprinting](#5-telemetry--fingerprinting)
6. [Ban Mechanisms & Detection](#6-ban-mechanisms--detection)
7. [Proxy Detection](#7-proxy-detection)
8. [Model Fallback Behavior](#8-model-fallback-behavior)
9. [Known Bugs](#9-known-bugs)
10. [Timeline of Events](#10-timeline-of-events)
11. [Key Sources](#11-key-sources)
12. [Actionable Recommendations](#12-actionable-recommendations)

---

## 1. Rate Limit Architecture

Anthropic uses a **three-layer rate limit system**:

### Layer 1: RPM/TPM (API-level)
- Requests per minute and tokens per minute
- Tier-based: Tier 1 (50 RPM) → Tier 4 (4,000 RPM)
- Uses **token bucket algorithm** (continuous replenishment, not fixed intervals)
- Cache-aware: only uncached input tokens count toward ITPM limits
- Hitting one layer does NOT affect others

### Layer 2: 5-Hour Rolling Window (Subscription)
- Primary rate limit for Claude Code subscribers
- Starts from first prompt, resets after 5 hours of inactivity
- `anthropic-ratelimit-unified-representative-claim: five_hour`
- Utilization is a float 0.0–1.0

### Layer 3: 7-Day Rolling Window (Subscription)
- Secondary/weekly cap added August 28, 2025
- Targets top 5% of subscribers running Claude Code 24/7
- Also targets account sharing and reselling

### Weekly Limits by Plan

| Plan | Monthly | Weekly Sonnet Hours | Weekly Opus Hours |
|------|---------|-------------------|-----------------|
| Pro | $20 | 40–80 | None |
| Max 5x | $100 | 140–280 | 15–35 |
| Max 20x | $200 | 240–480 | 24–40 |

### Token Weighting (Subscription)
- Output tokens weighted at **5x** input tokens (matching $5/$25 per MTok pricing)
- Cached writes weigh **same as standard inputs** (1x, NOT 1.25x like API pricing)
- Cached reads are **completely free** (NOT 0.1x like API pricing)
- W_out/W_in ratio ≈ 4.99 (confirmed empirically)

### Peak Hour Adjustments (March 2026)
- **5am–11am PT on weekdays**: limits drain faster
- Affects ~7% of users, mainly Pro tier
- Announced by Thariq Shihipar (Anthropic engineer) on X

### Shared Pool
- Usage is shared across Claude web, desktop, mobile, AND Claude Code
- Same account = same rate pool regardless of which OAuth token is used
- Proxy and direct Claude Code share the same unified quota

---

## 2. Unified Rate Limit Headers

### Full Header Set (from actual API responses)

```
anthropic-ratelimit-unified-status: allowed|rate_limited
anthropic-ratelimit-unified-reset: <unix_timestamp>
anthropic-ratelimit-unified-representative-claim: five_hour|seven_day

anthropic-ratelimit-unified-5h-status: allowed|rate_limited
anthropic-ratelimit-unified-5h-reset: <unix_timestamp>
anthropic-ratelimit-unified-5h-utilization: <float 0.0-1.0>

anthropic-ratelimit-unified-7d-status: allowed|rate_limited
anthropic-ratelimit-unified-7d-reset: <unix_timestamp>
anthropic-ratelimit-unified-7d-utilization: <float 0.0-1.0>

anthropic-ratelimit-unified-fallback: available
anthropic-ratelimit-unified-fallback-percentage: <float 0.2-0.5>

anthropic-ratelimit-unified-overage-status: rejected|allowed
anthropic-ratelimit-unified-overage-disabled-reason: org_level_disabled
```

### Interpretation

| Header | Meaning |
|--------|---------|
| `representative-claim` | Which window is currently governing (`five_hour` or `seven_day`) |
| `fallback-percentage` | Utilization threshold for model downgrade (0.2–0.5 observed) |
| `fallback: available` | Signals that cheaper model fallback should be used |
| `overage-status: rejected` | Account cannot use pay-per-token overage billing |
| `5h-utilization` | Current 5-hour window usage as fraction |
| `7d-utilization` | Current 7-day window usage as fraction |

### Model Tiering Under Load

| Utilization | Available Models |
|-------------|-----------------|
| 0–50% | Opus, Sonnet, Haiku |
| 50%+ (fallback threshold) | Sonnet, Haiku (Opus returns 429) |
| ~80%+ | Haiku only (Opus & Sonnet return 429) |
| 100% | All models return 429 |

Source: https://gist.github.com/andrew-kramer-inno/34f9303a5cc29a14af7c2e729b676fc9

---

## 3. Billing Header Algorithm

### Header Format
```
x-anthropic-billing-header: cc_version=2.1.91.a3f; cc_entrypoint=cli; cch=fa690;
```

### Fields

**cc_version** (version + integrity hash):
```
salt = "59cf53e54c78"
sampled = message_text[4] + message_text[7] + message_text[20]
# Pad with "0" if message shorter than index
version_hash = SHA-256(salt + sampled + CC_VERSION)[:3]
result = CC_VERSION + "." + version_hash
```

**cc_entrypoint**: How the request originated (`cli`, `sdk`, etc.)

**cch** (content hash) — TWO implementations exist:
1. **JS-level**: `SHA-256(message_text)[:5]` (first 5 hex chars)
2. **Native/Zig-level**: `xxhash64(request_body, seed=0x6E52736AC806831E) & 0xFFFFF` → 5 hex chars

### Placement
- Must be the FIRST entry in the `system` messages array
- Must NOT have `cache_control` set
- Without it: OAuth tokens scoped to Claude Code reject with "This credential is only authorized for use with Claude Code"

### Version Mismatch Consequences
- Mismatched `cc_version` strings cause Anthropic to apply **stricter rate limits**
- Opus/Sonnet get 429 while Haiku still works
- Must keep proxy version fields in sync with actual Claude Code version

### Cache Breakage with Proxies
- The `cch=` hash changes every request
- When routed through proxies, this breaks prompt caching
- Fix: `CLAUDE_CODE_ATTRIBUTION_HEADER=0` disables the header entirely
- GrowthBook killswitch `tengu_attribution_header` can remotely disable it

Source: https://gist.github.com/NTT123/579183bdd7e028880d06c8befae73b99

---

## 4. Native Client Attestation

### Zig-Level cch (Below JavaScript Runtime)

From the source code leak (March 31, 2026), in `system.ts` lines 59-95:

1. API requests include a `cch=00000` placeholder in the billing header
2. Before the request leaves the process, Bun's native HTTP stack (written in Zig) overwrites those five zeros with a computed hash
3. The server validates the hash to confirm the request came from a real Claude Code binary
4. This happens **BELOW the JavaScript runtime** — invisible to JS-layer interception

### Key Details
- Gated behind `NATIVE_CLIENT_ATTESTATION` compile-time flag
- Uses xxhash64 with seed `0x6E52736AC806831E` on the request body
- Running on stock Bun/Node instead of official binary: the `cch=00000` placeholder survives as-is
- Server-side `_parse_cc_header` function "tolerates unknown extra fields" — validation may be more forgiving than expected

### Implications for Proxies
- Proxies that compute their own cch using xxhash64 can replicate this attestation
- The server may or may not strictly validate the cch value
- If validation becomes strict, only the official binary can produce valid attestations

Source: https://alex000kim.com/posts/2026-03-31-claude-code-source-leak/

---

## 5. Telemetry & Fingerprinting

### Scale
- **640+ telemetry event types** across 3 parallel channels
- **40+ environment dimensions** fingerprinted
- Phones home **every 5 seconds**
- Each device gets a **unique permanent identifier**

### Three Telemetry Channels

1. **Statsig/GrowthBook** (feature flags + analytics):
   - User ID, session ID, app version, platform, terminal type
   - Organization UUID, account UUID, email address
   - Feature gates currently enabled
   - Falls back to `~/.claude/telemetry/` if network is down
   - Polled hourly for remote managed settings (policySettings)

2. **Sentry** (error reporting):
   - Working directory, project names, paths
   - Feature gates, user ID, email, session ID, platform

3. **Datadog** (metrics):
   - Flush interval: 15000ms (configurable via `CLAUDE_CODE_DATADOG_FLUSH_INTERVAL_MS`)
   - Process metrics, request timing, token counts

### Environment Dimensions (40+)

**Terminal detection**: `TERM_PROGRAM`, `TERM_PROGRAM_VERSION`, `ITERM_SESSION_ID`, `KITTY_WINDOW_ID`, `ALACRITTY_LOG`, `WT_SESSION`, `KONSOLE_VERSION`, `VTE_VERSION`

**Platform**: `OSTYPE`, `WSL_DISTRO_NAME`, `MSYSTEM`, platform, arch, node_version

**Cloud/CI**: `CODESPACES`, `GITPOD_WORKSPACE_ID`, `REPL_ID`, `FLY_APP_NAME`, `VERCEL`, `RENDER`, `GITHUB_ACTIONS`, `GITLAB_CI`, `CIRCLECI`, `BUILDKITE`

**SSH**: `SSH_CLIENT`, `SSH_CONNECTION`, `SSH_TTY`

**Process**: `constrainedMemory` (physical RAM), `rss`, `heapTotal`, `heapUsed`, `cpuUsage`

### Anti-Distillation Mechanisms (from Source Leak)

1. **Fake tool injection**: `ANTI_DISTILLATION_CC` flag sends `anti_distillation: ['fake_tools']` — server injects decoy tool definitions into system prompt to poison training data
2. **Connector-text summarization**: Server buffers assistant text between tool calls, summarizes with cryptographic signature. API recorders only get summaries, not full reasoning chains
3. Both gated behind feature flags and first-party-only checks

### Undercover Mode
- `undercover.ts` strips all Anthropic internals (codenames like "Capybara", "Tengu", internal Slack channels)
- There is NO force-OFF — guards against model codename leaks
- Can force ON with `CLAUDE_CODE_UNDERCOVER=1`

### Frustration Detection
- Regex-based detection in `userPromptKeywords.ts`
- Matches profanity and frustration expressions ("wtf", "ffs", "omfg")
- Reported in real-time telemetry

### autoDream
- Background subagent that scans all JSONL session transcripts
- Purpose unclear but runs autonomously

### Key Env Vars for Telemetry Control
```
CLAUDE_CODE_ENABLE_TELEMETRY=0          # Doesn't work on Windows
DISABLE_TELEMETRY=1                      # Doesn't work on Windows
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1  # Risk signal!
CLAUDE_CODE_ATTRIBUTION_HEADER=0         # Disables billing header
CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1 # Disables anti-distillation
```

**WARNING**: Setting `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` is itself a **risk signal**. The gateway should rewrite telemetry instead of blocking it.

Source: https://gist.github.com/unkn0wncode/f87295d055dd0f0e8082358a0b5cc467

---

## 6. Ban Mechanisms & Detection

### Confirmed Ban Triggers

| Trigger | Risk Level | Evidence |
|---------|-----------|----------|
| Account sharing/reselling | Critical | Official Anthropic statement |
| Running Claude Code 24/7 | High | Weekly limits specifically target this |
| Multiple Max accounts from same IP/device | High | Feb 2026 ban wave |
| Third-party tool usage with consumer OAuth | High | OpenClaw/Clawdbot crackdown |
| Unsupported region access | High | Chinese developer ban waves |
| Datacenter/VPN IPs | Medium | IP reputation checks |
| Frequent IP switching across countries | Medium | Location consistency checks |
| Browser fingerprint inconsistencies | Medium | Timezone/location mismatches |
| Disabling telemetry | Low-Medium | Risk signal, not direct trigger |

### IP-Based Detection (45% of all bans)
- **IP anomaly detection causes 45% of all account bans** (QuarkIP research)
- Chain bans: Once an IP fingerprint is blacklisted, ALL accounts associated with it are banned
- New accounts on same network get immediate "chain ban"
- Risk signals:
  - Frequent IP switching across countries
  - Shared IP pools (airport nodes, public WiFi)
  - Non-residential proxy IPs
  - Simultaneous multi-device login

### Risk-Signal-Based System
- Ban system is **risk-signal-based, not behavior-based**
- Looks at full picture: IP quality, account detail consistency, login patterns, payment info, browser signals
- Ban triggered when enough signals look suspicious simultaneously
- Not from any single action

### Anthropic's Official Position (Feb 2026, Thariq)
- "We haven't changed anything here. It's not against terms of service to have multiple MAX accounts."
- "Enforcement is aimed at people using accounts to resell tokens"
- Updated docs were "a docs clean up we rolled out that's caused some confusion"
- "We want to encourage local development and experimentation with the Agent SDK and claude -p"

### Ban Appeal
- Form: https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals
- Response times "currently longer than normal"
- Community reports ~82% success rate with proper evidence (unverified)
- No refund if terminated for ToS violation

---

## 7. Proxy Detection

### Detection Vectors

| Vector | What Leaks | Mitigation |
|--------|-----------|------------|
| `baseUrl` in telemetry events | Proxy URL | Strip field |
| `gateway` in provider detection | Proxy type | Strip field |
| `ANTHROPIC_BASE_URL` env var | Custom endpoint | Don't set in telemetry env |
| Version mismatch in billing header | Non-native client | Keep version in sync |
| `cch=00000` (no native attestation) | Non-official binary | Compute xxhash64 |
| Missing/disabled telemetry | Suspicious absence | Rewrite, don't block |
| IP reputation | Datacenter/VPN | Use residential IP |
| Device fingerprint inconsistency | Multiple devices | Normalize to canonical |
| Process metrics (RAM, heap) | Hardware differences | Randomize in range |

### Three-Layer Defense (CC Gateway approach)
1. **Env vars**: Route traffic through gateway, skip browser OAuth
2. **Clash rules**: Network-level blocking of direct Anthropic connections
3. **Gateway rewriting**: Identity normalization across all 40+ dimensions

### MCP Bypass
- `mcp-proxy.anthropic.com` is hardcoded and does NOT follow `ANTHROPIC_BASE_URL`
- MCP requests bypass the gateway entirely
- Use Clash to block this domain if MCP is not needed

---

## 8. Model Fallback Behavior

### Claude Code's Internal Fallback
- Claude Code has built-in silent fallback — user doesn't notice model switches
- VS Code extension: Zero indication of downgrade
- CLI: At least shows `Haiku 4.5 · Claude Max` in banner
- Error message deliberately opaque: `{"type":"error","error":{"type":"invalid_request_error","message":"Error"}}`

### Fallback Chain
```
Opus → Sonnet → Haiku
```

### GitHub Issue #35269: Silent Haiku Fallback
- Confirmed via MITM proxy: Claude Code sends `model: claude-opus-4-6`, gets HTTP 400, silently retries with Haiku
- 14+ hours of silent degradation reported
- Scope likely much larger — VS Code users don't know they're affected

### Quota Burn Rates
- Opus burns quota ~3–5x faster than Haiku per exchange
- Model routing (Opus for architecture, Sonnet for coding, Haiku for grunt work) reduces quota by ~40%
- `/compact` command reduces context 40–60%
- `--effort low` flag reduces token use by ~3x

---

## 9. Known Bugs

### Bug: Wrong Window Used for Rate Limiting (Dec 2025)
- Claude Code client uses 7-day utilization (~70-80%) instead of `representative-claim` header (which says `five_hour`)
- Users blocked despite 98% availability in 5-hour window and `status: allowed`
- Forces users to wait for 7-day reset instead of 5-hour reset
- Source: https://magazine.ediary.site/blog/claude-code-rate-limit-bug

### Bug: Prompt Caching Regression (March 2026)
- Cache invalidation firing on every turn
- 200,000-token project contexts billed repeatedly instead of once
- Worst case: 1,310 cache reads per 1 I/O token
- `--resume` flag triggers full reprocess at original cost
- Single prompts jumping usage from 21% to 100%
- GitHub issue #40524

### Bug: Billing Header Breaks Proxy Caching
- `cch=` hash changes every request
- Breaks prompt caching when routed through proxies
- Fix: `CLAUDE_CODE_ATTRIBUTION_HEADER=0`

---

## 10. Timeline of Events

| Date | Event |
|------|-------|
| Jul 28, 2025 | Anthropic announces weekly rate limits |
| Aug 28, 2025 | Weekly rate limits take effect |
| Sep 5, 2025 | Chinese companies banned from Claude |
| Sep 2025 | OpenAI acquires Statsig (Claude's telemetry provider) |
| Oct 9, 2025 | Discord mega-thread on rate limits begins |
| Dec 25-31, 2025 | Anthropic doubles limits as holiday gift |
| Jan 1, 2026 | Holiday bonus expires; users report ~60% reduction |
| Jan 5, 2026 | The Register reports developer complaints |
| Jan 27, 2026 | Philipp Spiess posts viral ban screenshot on X |
| Jan 2026 | Anthropic starts blocking third-party OAuth access |
| Feb 14, 2026 | OpenClaw creator joins OpenAI |
| Feb 19, 2026 | Thariq clarifies ban policy on X |
| Mar 2026 | New ban wave hits Chinese developers |
| Mar 20, 2026 | Claude Code 2.1.80 adds rate limit info to status line |
| Mar 26, 2026 | Anthropic announces peak-hour throttling |
| Mar 2026 | Prompt caching regression causes massive overconsumption |
| Mar 31, 2026 | Source code leak via npm map file (512K lines exposed) |
| Apr 1, 2026 | The Register publishes deep telemetry analysis |

---

## 11. Key Sources

### Official Anthropic
- Rate limits: https://docs.anthropic.com/en/api/rate-limits
- Appeals: https://support.claude.com/en/articles/8241253-safeguards-warnings-and-appeals
- Extra usage: https://support.claude.com/en/articles/12429409-extra-usage-for-paid-claude-plans
- Corporate proxy: https://docs.anthropic.com/en/docs/claude-code/corporate-proxy
- Cost management: https://docs.anthropic.com/en/docs/claude-code/costs

### Community Research
- Unified headers analysis: https://gist.github.com/andrew-kramer-inno/34f9303a5cc29a14af7c2e729b676fc9
- Billing header algorithm: https://gist.github.com/NTT123/579183bdd7e028880d06c8befae73b99
- All env vars (v2.1.81): https://gist.github.com/unkn0wncode/f87295d055dd0f0e8082358a0b5cc467
- OAuth flow: https://gist.github.com/changjonathanc/9f9d635b2f8692e0520a884eaf098351
- Token economics (65-day study): https://redasgard.com/blog/claude-max-token-economics-invisible-meter
- Rate limit bug analysis: https://magazine.ediary.site/blog/claude-code-rate-limit-bug
- Source leak analysis: https://alex000kim.com/posts/2026-03-31-claude-code-source-leak/

### GitHub Issues
- Silent Haiku fallback: https://github.com/anthropics/claude-code/issues/35269
- Rate limit on every command: https://github.com/anthropics/claude-code/issues/27336
- Telemetry leak: https://github.com/anthropics/claude-code/issues/5508
- Rate limit headers request: https://github.com/anthropics/claude-code/issues/33820
- Account disabled after payment: https://github.com/anthropics/claude-code/issues/5088

### News Coverage
- The Register (Discord bans): https://www.theregister.com/2026/01/05/claude_devs_usage_limits/
- TechCrunch (weekly limits): https://techcrunch.com/2025/07/28/anthropic-unveils-new-rate-limits-to-curb-claude-code-power-users/
- Forbes (glitching limits): https://www.forbes.com/sites/johnkoetsier/2026/03/26/anthropic-huge-pricing-issues-with-glitching-claude-code-limits/

### Proxy Projects
- CC Gateway: https://github.com/motiful/cc-gateway
- claude-code-mux (494★): https://github.com/9j/claude-code-mux
- ccproxy (Cursor): https://github.com/mergd/ccproxy

---

## 12. Actionable Recommendations

### For the Proxy

1. **Capture unified rate limit headers** — Display on portal dashboard:
   - 5h/7d utilization, status, reset times
   - Fallback percentage and availability
   - Overage status

2. **Keep version in sync** — Mismatched `cc_version` triggers stricter limits. Check `claude --version` regularly.

3. **Compute cch properly** — Use xxhash64 with seed `0x6E52736AC806831E` on the final request body. The `cch=00000` placeholder is a detection signal.

4. **Don't disable telemetry** — Rewrite it instead. `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` is a risk signal.

5. **Strip leak fields** — Remove `baseUrl` and `gateway` from telemetry events.

6. **Use residential IP** — Datacenter IPs cause 45% of bans.

7. **Normalize all 40+ dimensions** — Platform, arch, node version, terminal, package managers, runtimes, CI flags, deployment environment, process metrics.

8. **Handle prompt caching** — The billing header's `cch` changes per request, breaking caching. Consider `CLAUDE_CODE_ATTRIBUTION_HEADER=0` if caching is critical.

9. **Model fallback on 429** — Implement Opus → Sonnet → Haiku fallback chain, matching Claude Code's native behavior.

10. **Monitor for native attestation enforcement** — If Anthropic starts strictly validating the Zig-level cch, proxies running on Node/Bun will be detectable. Currently tolerant.

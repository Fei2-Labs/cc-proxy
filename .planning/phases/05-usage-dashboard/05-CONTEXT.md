# Phase 5: Usage Dashboard - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a usage dashboard showing per-client token usage rollups (daily/weekly/monthly), Anthropic rate limit display, and estimated USD cost per client. Data comes from the `request_logs` table populated in Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Usage Rollups
- **D-01:** Query `request_logs` with GROUP BY client_name and date truncation for daily/weekly/monthly views. All aggregation done in SQLite queries — no materialized views needed at this scale.
- **D-02:** Period selector: day (last 24h), week (last 7d), month (last 30d). Default to week.

### Cost Estimation
- **D-03:** Hardcode Anthropic pricing per model (input/output per 1M tokens). Calculate cost = (input_tokens * input_price + output_tokens * output_price) / 1_000_000. Cache tokens use input pricing.
- **D-04:** Show cost as estimated — not exact billing.

### Rate Limits
- **D-05:** Parse rate limit headers from upstream responses (`x-ratelimit-*` headers). Store latest values in SQLite settings. Display on dashboard.

### Claude's Discretion
- Chart/visualization approach (simple table vs bar chart)
- Exact pricing values per model
- Rate limit header parsing details

</decisions>

<canonical_refs>
## Canonical References

- `src/db.ts` — request_logs table, add query functions
- `src/proxy.ts` — Capture rate limit headers from upstream responses
- `portal/app/portal/usage/page.tsx` — Current placeholder to replace
- `.planning/REQUIREMENTS.md` — USAGE-02, USAGE-03, USAGE-04

</canonical_refs>

---

*Phase: 05-usage-dashboard*
*Context gathered: 2026-04-02*

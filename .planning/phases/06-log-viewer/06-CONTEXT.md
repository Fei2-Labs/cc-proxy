# Phase 6: Log Viewer - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a filterable log viewer page where admin can filter request logs by client, time range, and status, and click any entry to see full detail. Data comes from the `request_logs` table.

</domain>

<decisions>
## Implementation Decisions

### Filtering
- **D-01:** Client filter: dropdown populated from distinct client_name values in request_logs.
- **D-02:** Time filter: date range picker (from/to) or quick presets (last 1h, 6h, 24h, 7d).
- **D-03:** Status filter: buttons for All / Success (2xx) / Error (4xx-5xx) / Rate Limited (429).

### Detail View
- **D-04:** Click a row to expand inline detail panel (not a separate page). Shows all fields from the log entry.

### Claude's Discretion
- Pagination approach (offset-based, cursor, or load-more)
- Exact UI layout of filters and table

</decisions>

<canonical_refs>
## Canonical References

- `src/db.ts` — request_logs table, add query functions with filters
- `portal/app/portal/logs/page.tsx` — Current placeholder to replace
- `.planning/REQUIREMENTS.md` — LOG-01, LOG-02, LOG-03, LOG-04

</canonical_refs>

---

*Phase: 06-log-viewer*
*Context gathered: 2026-04-02*

---
phase: 1
slug: foundation-admin-auth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in assert + tsx (existing pattern) |
| **Config file** | none — uses existing test pattern |
| **Quick run command** | `tsx tests/auth.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `tsx tests/auth.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 3 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | AUTH-01 | integration | `curl -X POST localhost:8443/api/auth/login` | ❌ W0 | ⬜ pending |
| 1-01-02 | 01 | 1 | AUTH-02 | integration | `curl -b cookies.txt localhost:8443/portal` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | AUTH-01 | manual | Browser login flow | N/A | ⬜ pending |
| 1-02-02 | 02 | 1 | AUTH-02 | manual | Browser refresh test | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/auth.test.ts` — stubs for AUTH-01, AUTH-02 (JWT sign/verify, password check)
- [ ] Test fixtures for mock database and config

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Login page renders | AUTH-01 | UI rendering requires browser | Navigate to /login, verify form appears |
| Session persists on refresh | AUTH-02 | Browser cookie behavior | Login, refresh page, verify still authenticated |
| Sidebar navigation | AUTH-01 | Visual layout verification | Login, verify sidebar shows 5 nav items |
| Redirect to login | AUTH-01 | Browser redirect behavior | Clear cookies, navigate to /portal, verify redirect |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 3s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

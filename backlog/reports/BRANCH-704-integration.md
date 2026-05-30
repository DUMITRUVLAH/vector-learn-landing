# BRANCH-704 Integration Architect Report

**Date:** 2026-05-30
**Verdict:** CONNECTED

## API wiring
- `GET /api/analytics/branches` → analyticsRoutes → joined `branches`, `students`, `payments`, `lessons` tables.
- All joins are tenant-scoped (`eq(branches.tenantId, tenantId)`).
- Branch KPI response shape: `{ branches: [{ branchId, branchName, mrr, activeStudents, lessonsThisMonth }] }`.

## Module connections
- BRANCH-701 (schema) provides `branches.id`, `students.branchId`, `lessons.branchId`.
- BRANCH-702 (switcher) is UI-only — analytics page is independent of the branch switcher.
- BRANCH-703 (scoped roles) — analytics endpoint is accessed by admins (full view). Scoped managers would see their own data if we added scope enforcement here; out of scope for BRANCH-704 (analytics is an admin tool).

## DB portability
- `sum(payments.amountCents)` result: `Number(... ?? 0)` handles both pg-js and PGlite return shapes.
- `count(students.id)` result: `Number(activeRow?.cnt ?? 0)` — safe.

## Consolidated mode unchanged
- Existing funnel/lost-reasons/ROAS widgets render when `branchView === "consolidated"`, which is the default.
- REP-301 behavior: unchanged.

**Verdict: CONNECTED**

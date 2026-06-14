# Backlog Critique — FIN SPEND+CAPTURE phases
Date: 2026-06-14
Items: SPEND-003, CAPTURE-001, CAPTURE-002

## Verdict: improved(0) — specs build-ready

### SPEND-003 UI Cheltuieli
- Scope: clean. Closes SPEND phase. No reinvention — reuses SPEND-002 API.
- AC: concrete. vatDeductible radio (not optional) correctly enforces FIN-CORE rule.
- Tests: T-SPEND-003-3 (vatDeductible missing = error) is the key differentiator test — kept.
- Enhancement: CSV export (AC#12) is a nice-to-have; acceptable in scope since it's a trivial
  frontend blob download (no new API needed — use the filtered GET /expenses data).

### CAPTURE-001 Schema fin_captures
- Schema design: JSONB with confidence per field is correct for "AI proposes" pattern.
- No competing system: no existing fin_captures table in codebase.
- Migration prefix 0120 verified free (max on main = 0119_fin_expenses.sql).
- statement-breakpoint rule: spec explicitly requires it — builder must apply.

### CAPTURE-002 AI Pipeline
- Correctly reuses callAi + aiAuditLog — no new AI client reinvented.
- Mock mode required: callAi already has stub pattern — builder extends STUB_RESPONSES.
- Route mount discipline: spec calls out check-route-mounts.mjs gate explicitly.
- Hono route order: /captures specific paths registered before any /:id — builder must follow
  hono-specific-route-before-param.md solution.
- Tenant safety: 404 on cross-tenant access (not 403, not data) — AC#7 correct.

## Safe fixes applied to specs: none needed
## High-value enhancements proposed: 0 (scope already correct)
## Needs-owner-decision items: none

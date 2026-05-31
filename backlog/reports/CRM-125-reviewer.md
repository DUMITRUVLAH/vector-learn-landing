# CRM-125 — Code Review

**Verdict: APPROVED** (cycle 1)

## Design system
- Stage color tokens used as-is from DB. No hardcoded hex. ✅
- Probability level colors: text-success (≥60%), text-amber-600/dark:text-amber-400 (≥25%), text-muted-foreground (<25%). ✅

## Accessibility
- `role="table"`, `aria-label` on table element. ✅
- Column headers have `scope="col"`. ✅
- Edit input: `aria-label` includes stage name. ✅
- Confirm/cancel buttons: `aria-label` includes stage name + action. ✅
- Empty state visible to screen readers. ✅

## Dark mode
- amber-600 → `dark:text-amber-400` variant. ✅
- All other tokens semantic. ✅

## TypeScript
- Zero `any`. `ForecastData`, `ForecastStage` interfaces exported from analytics.ts. ✅
- Props interface for `ForecastWidget`. ✅

## Integration
- `GET /api/analytics/crm/forecast` joins `pipeline_stages` + aggregates `leads.value_cents` per stage key. ✅
- `pipeline_stages.probability_pct` column added; migration `0008_certain_morg.sql` generated and committed. ✅
- `PATCH /api/pipeline-stages/:id` accepts `probabilityPct` via updated schema. ✅
- `ForecastWidget` mounted in AnalyticsPage. ✅
- LeadsPage header shows weighted forecast total. ✅
- DB-portability: `Array.isArray(result) ? result : ...` pattern applied. ✅

## Tests
- 10 tests: T-CRM-125-1..4 + math unit + empty state — all green. ✅
- Build, typecheck, lint (59 pre-existing warnings, 0 new) pass. ✅

## Notes
- Chunk size warning is pre-existing (same bundle, not from this PR).

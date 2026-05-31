# CRM-125 — Integration Architecture Review

**Verdict: CONNECTED**

## Schema changes
- `pipeline_stages.probability_pct` integer, default 10, NOT NULL ✅
- `DEFAULT_PIPELINE_STAGES` updated with per-stage defaults (new=10, contacted=25, trial=60, paid=100, lost=0) ✅
- Migration `0008_certain_morg.sql` committed ✅

## API routes
- `GET /api/analytics/crm/forecast` — new endpoint, authenticated, tenant-scoped ✅
  - Joins `pipeline_stages` + aggregates `leads.value_cents` per `stage` key
  - Returns `{ stages: [{ stageId, stage, label, color, probabilityPct, count, grossCents, weightedCents }], totalGrossCents, totalWeightedCents }`
- `PATCH /api/pipeline-stages/:id` — extended with `probabilityPct` field ✅
- `POST /api/pipeline-stages` — extended with `probabilityPct` field ✅

## Cross-module connections
- `ForecastWidget` integrated in `AnalyticsPage` ✅
- `LeadsPage` header shows `Forecast: €X` when `totalWeightedCents > 0` ✅
- Client `getForecast()` + `updateStageProbability()` added to `analytics.ts` API lib ✅
- `PipelineStage` type now includes `probabilityPct` from schema inference ✅

## Tenant safety
- `GET /api/analytics/crm/forecast`: `pipelineStages` filtered by `tenantId`, `leads` filtered by `tenantId` ✅
- No cross-tenant data leakage ✅

## DB portability
- `Array.isArray(valueByStageResult) ? valueByStageResult : ...` guard on aggregate result ✅

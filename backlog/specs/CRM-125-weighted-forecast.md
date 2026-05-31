---
id: CRM-125
slug: weighted-forecast
depends_on: [CRM-113, CRM-112]
phase: G
milestone: CRM
---

# CRM-125 — Forecast ponderat pe pipeline (Weighted Revenue Forecast)

## Goal

Afișează o previziune a venitului pe pipeline bazată pe probabilitățile de câștig per stadiu (configurabile per tenant). Fiecare stadiu are un `probability_pct` (0–100%), iar forecast-ul ponderat = Σ(value_cents × probability_pct / 100) per stadiu. Un widget dedicat pe pagina de analytics + un card sumar în header-ul kanban.

## User stories

- **US-CRM-125-1**: Ca manager, vreau să văd forecast-ul ponderat al venitului (€ ponderați vs. € totali brut), ca să planific cash-flow-ul.
- **US-CRM-125-2**: Ca owner, vreau să configurez probabilitatea de câștig per stadiu (ex: new=10%, trial=60%, paid=100%), ca să am un forecast realist.
- **US-CRM-125-3**: Ca manager, vreau să văd breakdown forecast per stadiu (€ brut vs. € ponderați vs. count), ca să identific stadiul cu cel mai mare potențial.

## Acceptance criteria

1. **Schema DB**: `pipeline_stages.probability_pct` integer (0–100, default: new=10, contacted=25, trial=60, paid=100, lost=0).
2. **Migration**: generată și commitată; `db:reset && db:seed` trece.
3. **API `GET /api/analytics/crm/forecast`**: returnează per stadiu `{ stage, label, color, count, grossCents, weightedCents, probabilityPct }` + totale `{ totalGrossCents, totalWeightedCents }`.
4. **UI — `ForecastWidget`** pe pagina `/app/analytics`: tabel cu stadii, valoare brută, probabilitate%, valoare ponderată, + card sumar total.
5. **UI — `ProbabilityEditor`** pe pagina Stadii (Settings → Stadii sau în ForecastWidget): input numeric per stadiu 0–100%, salvat via `PATCH /api/pipeline-stages/:id`.
6. **Header kanban** (`LeadsPage`): afișează și „Forecast: €X ponderat" lângă total valoare, când totalWeightedCents > 0.
7. **API smoke**: `GET /api/analytics/crm/forecast` → 200.
8. **A11y**: tabelul are `role="table"`, header, aria-labels; inputurile au labels.
9. **Dark mode**: semantic tokens, fără hex.
10. **TypeScript strict**: zero `any`, interfaces pentru toate tipurile.

## Files

### New
- `server/routes/analytics.ts` — extend with `GET /api/analytics/crm/forecast`
- `src/lib/api/analytics.ts` — add `getForecast()` helper
- `src/components/crm/ForecastWidget.tsx` — widget forecast + probability editor
- `src/__tests__/crm/forecast.test.tsx` — unit tests

### Modified
- `server/db/schema/pipeline.ts` — add `probability_pct` column
- `server/routes/pipeline.ts` — include `probability_pct` in GET/POST/PATCH
- `src/pages/app/AnalyticsPage.tsx` — mount ForecastWidget
- `src/pages/app/LeadsPage.tsx` — show weighted forecast in header
- `backlog/crm/TEST-SCENARIOS.md` — append CRM-125 scenarios

## Tests

- **T-CRM-125-1** `[blocant]` Given 3 leaduri în „trial" cu value_cents total 100000 și probability=60%, Then forecast ponderat = 60000.
- **T-CRM-125-2** `[blocant]` Given owner schimbă probability „new" de la 10% la 20%, Then forecast-ul se recalculează.
- **T-CRM-125-3** Given `GET /api/analytics/crm/forecast` autenticat, Then 200 cu `{ stages: [...], totalGrossCents, totalWeightedCents }`.
- **T-CRM-125-4** Multi-tenant: forecast-ul tenantului A nu include date din tenantul B.

## Definition of Done

- [ ] Toate AC-urile implementate
- [ ] `npm run build && npm run typecheck && npm run lint && npm test` verzi
- [ ] Migration gate: `db:generate` fără uncommitted diff, `db:reset && db:seed` trece
- [ ] API smoke: login + GET /api/analytics/crm/forecast → 200
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
- [ ] PR deschis; STATE.json + BACKLOG.md actualizate

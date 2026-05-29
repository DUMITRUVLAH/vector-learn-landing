---
id: REP-301
title: "Dashboard KPI real: MRR, elevi activi, churn, ARPU + period toggle"
milestone: REP
phase: "1 — KPI Dashboard"
priority: P0
slug: dashboard-kpi
depends_on: [MVP-007, MVP-004]
status: pending
---

# REP-301 — Dashboard KPI live

## Goal

Dashboard `/app/analytics` (deja există pagina AnalyticsPage) extins cu KPI cards reale
calculate din DB: MRR, elevi activi, churn rate, ARPU; cu period toggle (7d/30d/90d/12m)
și comparație față de perioada anterioară (Δ% badge).

## In scope

- **API `GET /api/analytics/kpi`** (nou, tenant-scoped):
  - Query params: `period=7d|30d|90d|12m` (default `30d`)
  - Returnează:
    - `mrr_cents`: suma plăților cu status=paid în perioadă (aproximare MRR)
    - `active_students`: count students cu status=active
    - `new_students`: count studenți creați în perioadă
    - `churn_rate_pct`: (studenți marcați archived sau paused în perioadă) / active_students_start * 100
    - `arpu_cents`: mrr_cents / active_students (sau 0 dacă active=0)
    - `prev_mrr_cents`, `prev_active_students`: valorile din perioada anterioară (pentru Δ%)
  - Calcule simple, fără date warehouse
- **UI extins în AnalyticsPage** (deja există la `/app/analytics`):
  - Period toggle bar (7z / 30z / 90z / 12l) — actualizează KPI cards
  - 5 KPI cards: MRR (€), Elevi activi, Elevi noi, Churn rate (%), ARPU (€)
  - Fiecare card: valoare principală + Δ% față de perioadă anterioară (verde dacă pozitiv, roșu dacă negativ)
  - Skeleton loading când se încarcă
  - Dark mode, design tokens

## Out of scope

- Line chart MRR în timp (REP-302)
- Cohort analysis (REP-303)
- Export PDF/Excel (REP-304)
- Filtru filială / profesor

## Data / API

### GET /api/analytics/kpi
Query: `?period=30d`
Response:
```json
{
  "period": "30d",
  "mrrCents": 150000,
  "activeStudents": 45,
  "newStudents": 8,
  "churnRatePct": 2.2,
  "arpuCents": 3333,
  "prevMrrCents": 140000,
  "prevActiveStudents": 43
}
```

## Acceptance criteria

- [ ] GET /api/analytics/kpi?period=30d → 200 cu toate câmpurile
- [ ] Period toggle actualizează toate KPI cards
- [ ] Δ% calculat față de perioadă anterioară (verde/roșu)
- [ ] Skeleton loading pe card-uri
- [ ] Dark mode parity

## Tests

1. [blocant] GET /api/analytics/kpi → 200
2. [blocant] Δ% corect: mrrCents > prevMrrCents → deltaPositive
3. [normal] Period toggle UI actualizează KPI cards

## DoD

- Build + typecheck + lint verde
- API smoke: GET /api/analytics/kpi → 200
- Tests verzi
- Reviewer APPROVED
- Personas salvate

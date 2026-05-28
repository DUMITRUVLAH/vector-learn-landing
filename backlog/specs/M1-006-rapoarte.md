---
id: M1-006
title: Rapoarte și analize — module page
milestone: M1
estimate_hours: 2
priority: P1
---

# M1-006 — Rapoarte și analize

## Goal
Pagina `/modules/rapoarte` cu dashboard interactiv (LTV, ARPU, churn, MRR), filtre de perioadă, chart line + bar.

## User stories
- **Director**: "Vreau să văd KPI-urile centrului în timp real."
- **Manager**: "Cum aflu rata de atriție pe trimestre?"

## Acceptance criteria
- [ ] Pagina la `/modules/rapoarte`
- [ ] 4 KPI cards animate (count-up de la 0 la valoare la mount)
- [ ] Toggle perioadă: 7 zile / 30 zile / 90 zile / 12 luni — datele se schimbă
- [ ] Line chart SVG (MRR în timp)
- [ ] Bar chart SVG (venit per disciplină)
- [ ] Tabel top 5 elevi după LTV
- [ ] 4 secțiuni descriptive
- [ ] FAQ 4 întrebări

## Files
- `src/pages/modules/RapoartePage.tsx`
- `src/components/modules/rapoarte/KPICard.tsx`
- `src/components/modules/rapoarte/LineChart.tsx`
- `src/components/modules/rapoarte/BarChart.tsx`

## Tests required
- KPI count-up animație (componenta primește valoarea inițială corectă)
- Toggle perioadă schimbă datele
- Line chart returnează `<polyline>` cu puncte corecte

## DoD
Quality gates trec.

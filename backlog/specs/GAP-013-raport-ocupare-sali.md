---
id: GAP-013
title: Raport ocupare săli
milestone: GAP
phase: 4
priority: LOW
status: pending
dependencies: [rooms, lessons, timetable_slots]
feeds_into: []
branch: feat/GAP-faza-4-analytics
---

## Scop

Heat-map ocupare per sală per zi a săptămânii. Ajută la decizii de investiție (mobilă, echipament, deschidere sală nouă).

## Criterii de acceptare

- [ ] `GET /api/analytics/room-occupancy?from=&to=&roomId=` returnează `[{ roomId, roomName, dayOfWeek, occupancyPct }]`
- [ ] `occupancyPct` = (minute lecții programate în zi) / (minute disponibile per zi, default 8h=480min) × 100
- [ ] Vizualizare heat-map (7 zile × N săli) cu culori semantice (verde/galben/roșu) — fără hex hardcodat
- [ ] Filtrabil pe perioadă și pe sală individuală
- [ ] Afișat în SchedulePage tab „Săli" sau ReportsPage

## Fișiere implicate

- `server/routes/analytics.ts` — endpoint `/room-occupancy`
- `src/pages/app/SchedulePage.tsx` sau `AnalyticsPage.tsx` — heat-map

## Teste

- Unit: calcul `occupancyPct` corect
- Smoke: heat-map renderizează fără crash

## DoD

Build + typecheck + lint + teste verzi. PR pe branch `feat/GAP-faza-4-analytics`.

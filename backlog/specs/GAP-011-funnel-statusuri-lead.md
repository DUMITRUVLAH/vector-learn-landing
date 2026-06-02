---
id: GAP-011
title: Funnel vizual bazat pe schimbări de status lead
milestone: GAP
phase: 4
priority: MEDIUM
status: pending
dependencies: [leads, leadInteractions, CRM-112]
feeds_into: [GAP-012]
branch: feat/GAP-faza-4-analytics
---

## Scop

Vizualizare tip pâlnie care arată câți leads au trecut prin fiecare etapă și rata de conversie între etape pe o perioadă. Răspunde la „Câți din cei care au venit la trial au rămas?".

## Criterii de acceptare

- [ ] `GET /api/analytics/lead-funnel?from=&to=&source=` returnează `[{ stage, count, conversionFromPrev }]` bazat pe `leadInteractions` cu `type = 'stage_change'`
- [ ] Etape: `new → contacted → trial → paid → lost`
- [ ] Widget „Funnel Leads" adăugat în KpiDashboardPage sau ca secțiune în ReportsPage/AnalyticsPage
- [ ] Filtrabil pe: perioadă (luna curentă / trimestru / an / custom date range), sursă UTM
- [ ] Rata de conversie `new → paid` afișată procentual și ca număr absolut
- [ ] Click pe o etapă → link la lista de leads filtrată pe acel stage + perioadă

## Fișiere implicate

- `server/routes/analytics.ts` — endpoint `/lead-funnel`
- `src/pages/app/AnalyticsPage.tsx` sau `KpiDashboardPage.tsx` — widget funnel

## Teste

- Unit: endpoint returnează etapele în ordine cu count corect
- Unit: filtrare pe sursă funcționează
- Smoke: widget renderizează fără crash cu date

## DoD

Build + typecheck + lint + teste verzi. PR pe branch `feat/GAP-faza-4-analytics`.

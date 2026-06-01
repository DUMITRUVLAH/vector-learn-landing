---
id: GAP-012
title: Raport sursă reclamă cu conversie completă
milestone: GAP
phase: 4
priority: MEDIUM
status: pending
dependencies: [leads, payments, CRM-112, GAP-011]
feeds_into: []
branch: feat/GAP-faza-4-analytics
---

## Scop

Raport tabelar per sursă UTM: leads, convertiți, revenue generat, rată conversie. Justifică bugetul de marketing — care anunț aduce studenți plătitori.

## Criterii de acceptare

- [ ] `GET /api/analytics/source-conversion?from=&to=` returnează `[{ source, leads, converted, revenueCents, conversionRate }]`
- [ ] Sursa = `utm_source` sau `utm_medium` sau `leadSource` dacă UTM lipsește
- [ ] Tabel sortat descendent după `revenueCents` implicit
- [ ] Filtrabil pe `utm_source`, `utm_medium`, `utm_campaign`
- [ ] Export CSV (refolosește REP-304 export logic)
- [ ] Coloana „Cost campanie" introdusă manual per sursă (stored în `tenant_settings` jsonb)
- [ ] Afișat în AnalyticsPage sau RevenueChartsPage ca tab nou „Surse"

## Fișiere implicate

- `server/routes/analytics.ts` — endpoint `/source-conversion`
- `src/pages/app/AnalyticsPage.tsx` sau `RevenueChartsPage.tsx` — tab nou

## Teste

- Unit: endpoint agregă corect leads + payments per sursă
- Unit: lead fără UTM → apare la sursă `direct` sau `unknown`
- Smoke: tabelul renderizează fără crash

## DoD

Build + typecheck + lint + teste verzi. PR pe branch `feat/GAP-faza-4-analytics`.

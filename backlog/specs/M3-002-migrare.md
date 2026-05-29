---
id: M3-002
title: Migration Cost Estimator
milestone: M3
estimate_hours: 1.5
priority: P1
---

# M3-002 — Migration Cost Estimator

## Goal
Pagina `/calculator/migrare` — estimează costul (în timp + bani) pentru migrarea de la sistemul actual la Vector Learn. Acoperă: extragere date, mapare câmpuri, validare, training echipă.

## Acceptance criteria
- [ ] Pagina la `/calculator/migrare`
- [ ] Input: sistem sursă (HOLLIHOP, Sycret, AnyClass, Excel, alt CRM), nr. elevi, nr. profesori, nr. ani istoric
- [ ] Output: durată estimată (zile), număr ore lucrate, cost migrare (gratuit pe Pro+, sau X €), checklist tehnic
- [ ] Timeline vizual cu fazele (extract → map → validate → import → training → go-live)
- [ ] Comparație "self-service" vs "white-glove" (echipa noastră face tot)
- [ ] CTA "Programează apel migrare"
- [ ] Responsive + dark mode

## Files
- `src/pages/tools/MigrationEstimatorPage.tsx`
- `src/components/tools/MigrationTimeline.tsx`
- `src/__tests__/tools/migrare.test.tsx`

## DoD
Quality gates pass.

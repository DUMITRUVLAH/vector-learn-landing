---
id: M1-008
title: Multi-filiale și franciză — module page
milestone: M1
estimate_hours: 1.5
priority: P2
---

# M1-008 — Multi-filiale și franciză

## Goal
Pagina `/modules/multifilale` cu hartă interactivă a filialelor (SVG) și switcher de filială cu KPI-uri per locație.

## Acceptance criteria
- [ ] Pagina la `/modules/multifilale`
- [ ] Hartă SVG a României cu 4 pin-uri (București, Cluj, Iași, Timișoara) — hover → tooltip cu KPI-uri
- [ ] Switcher dropdown "Toate filialele / București / Cluj / ..." — actualizează KPI-urile afișate
- [ ] 4 KPI cards (elevi, profesori, venituri lună, satisfacție)
- [ ] 4 features: branding per filială, rapoarte consolidate, roluri pe filială, contracte franciză
- [ ] FAQ 4 întrebări

## Files
- `src/pages/modules/MultifilalePage.tsx`
- `src/components/modules/multifilale/RomaniaMap.tsx`
- `src/components/modules/multifilale/BranchSwitcher.tsx`

## Tests required
- Switcher schimbă datele
- Hover pe pin afișează tooltip

## DoD
Quality gates trec.

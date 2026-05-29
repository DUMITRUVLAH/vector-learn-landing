---
id: M3-003
title: Pricing Configurator interactiv
milestone: M3
estimate_hours: 1.5
priority: P0
---

# M3-003 — Pricing Configurator

## Goal
Pagina `/calculator/pricing` — configurator vizual care recomandă planul potrivit (Starter, Growth, Pro, Enterprise) în funcție de dimensiunea și nevoile centrului. Output: plan recomandat + preț lunar/anual + features incluse + features extra.

## Acceptance criteria
- [ ] Pagina la `/calculator/pricing`
- [ ] Wizard cu 4-5 pași (Quiz-style): elevi, filiale, integrări necesare, white-label, AI usage
- [ ] La final: card cu plan recomandat (highlighted) + comparație cu celelalte
- [ ] Toggle lunar/anual (cu reducere 17%)
- [ ] Toggle RON/EUR (răspuns recurring persona feedback)
- [ ] Feature checklist evidențiind ce e inclus per plan
- [ ] CTA "Începe trial 14 zile" pe planul recomandat
- [ ] Responsive + dark mode

## Files
- `src/pages/tools/PricingConfiguratorPage.tsx`
- `src/components/tools/PricingWizard.tsx`
- `src/components/tools/PlanRecommendation.tsx`
- `src/__tests__/tools/pricing.test.tsx`

## DoD
Quality gates pass.

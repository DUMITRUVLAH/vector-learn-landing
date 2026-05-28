---
id: M1-009
title: Integrări 350+ — module page
milestone: M1
estimate_hours: 1.5
priority: P1
---

# M1-009 — Integrări 350+

## Goal
Pagina `/modules/integrari` cu directory căutabil + filtrabil al integrărilor pe categorii.

## Acceptance criteria
- [ ] Pagina la `/modules/integrari`
- [ ] Input search live (filtrare prin nume integrare)
- [ ] Filter chips pe categorie: Telefonie / Plăți / Mesagerie / Contabilitate / Email / Analytics / Cloud / Automation
- [ ] Grid de minimum 32 integrări (4 per categorie) — card cu logo placeholder, nume, descriere scurtă
- [ ] Click pe card → modal cu detalii
- [ ] Secțiune "API & Webhooks" cu exemplu de cod
- [ ] FAQ 4 întrebări

## Files
- `src/pages/modules/IntegrariPage.tsx`
- `src/components/modules/integrari/IntegrationCard.tsx`
- `src/components/modules/integrari/IntegrationModal.tsx`
- `src/data/integrations.ts` (lista de 32)

## Tests required
- Search filtrează lista corect
- Filter chips filtrează lista corect
- Click pe card deschide modal

## DoD
Quality gates trec.

---
id: SPLIT-302
title: "Landing / rămâne CRM educațional; link discret Business Suite → /business"
milestone: SPLIT
phase: "4"
status: pending
branch: feat/SPLIT-crm-cleanup
depends_on: [SPLIT-102]
spec: backlog/specs/SPLIT-302.md
---

## Goal

Landing-ul `/` rămâne pentru CRM educațional Vector Learn. Se adaugă un link discret (footer sau header) care să permită accesul la Business Suite (`/business`) fără a distrage utilizatorul educațional principal.

**Situatie actuală:** SPLIT-102 a creat `/business` landing page dedicat. Landing-ul `/` (HomePage din App.tsx) nu are niciun link spre `/business`. SPLIT-302 adaugă acel link discret.

Forma acceptabilă:
- Un mic link în footer: „Ești o companie? → Business Suite" cu href `#/business`
- SAU în header: un link de tipul „Business" discret la capătul din dreapta (text mic, fără accent vizual)

NU se modifică hero-ul, value proposition-ul sau structura principală a landing-ului educațional.

## User Stories

- Ca prospect business (FinDesk/PAR/ITPark), vreau să pot ajunge la Business Suite de pe landing-ul principal, pentru că pot intra pe site fără să știu de /business.
- Ca utilizator educațional, vreau ca landing-ul / să rămână concentrat pe CRM educațional, pentru că nu mă interesează Business Suite.

## Acceptance Criteria

- [ ] Landing-ul `/` conține un link vizibil spre `/business` (sau `#/business`), discret (sub-text, footer, sau link mic în header — nu btn CTA principal).
- [ ] Link-ul este funcțional: navighează la `/business` (BusinessLandingPage).
- [ ] Hero-ul și CTA-ul principal al landing-ului educațional rămân neschimbate.
- [ ] Link-ul are text clar: „Business Suite", „FinDesk", sau echivalent — nu ambiguu.
- [ ] Build + typecheck green.
- [ ] Design: semantic tokens, funcțional în light+dark.

## Files Affected

- `src/App.tsx` — funcția `HomePage()` sau footer-ul general al landing-ului

## Tests

- **T-SPLIT-302-1** [blocant] Given landing-ul / este randat, When se caută text "Business Suite" sau "business", Then există cel puțin un element cu link spre /business sau #/business.
- **T-SPLIT-302-2** [normal] Given link-ul Business Suite este găsit, When se verifică href-ul, Then conține "/business".
- **T-SPLIT-302-3** [normal] Given landing-ul / este randat, When se verifică hero-ul principal, Then CTA-ul principal rămâne același (înscrie-te / demo / etc. pentru CRM educațional).

## DoD

- T-SPLIT-302-1 (blocant) trece.
- Build green.
- Reviewer APPROVED.

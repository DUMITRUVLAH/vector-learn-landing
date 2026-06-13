---
id: ITPARK-501
title: "Scrisori de confirmare (5 tipuri) pre-completate din datele rezidentului"
milestone: ITPARK
phase: "F"
status: pending
attempts: 0
depends_on: ["ITPARK-101"]
spec: backlog/specs/ITPARK-501-confirmation-letters.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
Cele 5 scrisori de confirmare cerute la dosar, generate pre-completate din datele rezidentului
(denumire, IDNO, perioadă, adresă), eliminând placeholderele „XXX". Editabile înainte de export.

## User stories
- **Ca** contabil, **vreau** scrisorile gata completate, **pentru că** acum înlocuiesc manual „XXX" în
  fiecare document Word.

## Acceptance criteria
- [ ] Generează 5 piese (`itpark_packet_documents`): confirmare lipsă venituri ajustate; confirmare
  adresă juridică; confirmare lipsă subdiviziuni; descrierea activității; (a 5-a după șablon)
- [ ] Fiecare șablon injectează: denumire rezident, IDNO, perioada (`01.09.YYYY–31.12.YYYY` sau perioada dosarului), adresa, administrator; data implicită = data curentă
- [ ] Niciun placeholder „XXX"/„Numele Prenumele" rămas necompletat unde avem datele
- [ ] Editor text pe fiecare scrisoare (poți ajusta); status draft/ready
- [ ] design-system, dark mode, a11y; print-friendly

## Files
**New:** `src/pages/app/fin/itpark/Letters.tsx`, `src/lib/itpark/letterTemplates.ts` (+ test)
**Modified:** `ItparkDetail.tsx` (tab „Scrisori"), `server/routes/itparkEngagements.ts` (persist packet docs)

## Tests
- **T-501-1** [blocant] fiecare scrisoare conține denumirea+IDNO+perioada+adresa rezidentului (fără „XXX")
- **T-501-2** [normal] editarea unei scrisori persistă

## DoD
- vitest + check-refs verzi; a11y axe 0 critical/serious
- Reviewer APPROVED; integration-architect CONNECTED; Persona reports salvate

---
id: ITPARK-601
title: "Export PDF întreg pachet (Anexa 2,3,4 + scrisori + declarație) semnabil"
milestone: ITPARK
phase: "G"
status: pending
attempts: 0
depends_on: ["ITPARK-403", "ITPARK-502"]
spec: backlog/specs/ITPARK-601-pdf-export.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
Livrabilul final: un export PDF al întregului dosar (Anexa 2, 3, 4 + 5 scrisori + declarația),
formatat ca șabloanele oficiale, cu diacritice corecte, gata de semnat. Refolosește pipeline-ul PDF
existent (`parPdf`/html2canvas).

## User stories
- **Ca** contabil, **vreau** un singur PDF cu tot dosarul, **pentru că** îl trimit administratorului
  și auditorului spre semnare.

## Acceptance criteria
- [ ] Buton „Export PDF" pe detaliu dosar → generează un PDF cu toate piesele (sau selecție)
- [ ] Diacritice `ă â î ș ț` corecte (fără mojibake) — refolosește abordarea din `parPdf.ts`
- [ ] Layout fidel șabloanelor (tabele Anexa 2/3/4, scrisori cu loc de semnătură/dată)
- [ ] Export individual pe piesă + export pachet complet
- [ ] La export → `status=exported`, intrare în `itpark_audit`
- [ ] Nu blochează când dosarul are zeci de pagini (96 linii Anexa 3)

## Files
**New:** `src/lib/itpark/itparkPdf.ts` (refolosește util parPdf), buton în `ItparkDetail.tsx`, test
**Modified:** `server/routes/itparkEngagements.ts` (status + audit)

## Tests
- **T-601-1** [blocant] PDF generat conține Anexa 2,3,4 + scrisori + declarație; diacritice corecte
- **T-601-2** [normal] export → status exported + audit log

## DoD
- vitest (smoke pe generare) + check-refs verzi
- Reviewer APPROVED; **adversarial-reviewer** (PDF cu date financiare oficiale = risc de inexactitate) fără blocant; integration-architect CONNECTED (reutilizează html2canvas/jsPDF din parPdf, fără COMPETING_SYSTEM)
- Persona reports salvate

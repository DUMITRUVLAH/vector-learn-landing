---
id: PAR-114
title: "Generator PDF parPdf.ts — fidel formularului PAR (toate 16 secțiuni, checkbox-uri, semnături, MDL)"
milestone: PAR
phase: "E"
status: pending
attempts: 0
depends_on: [PAR-109]
spec: backlog/specs/PAR-114-pdf-generator.md
core: backlog/par/PAR-CORE.md
---

## Goal

Generatorul PDF care reproduce fidel formularul „Payment Action Request (PAR) Form" din documentul
inserat — exact layout-ul, cele 16 secțiuni, opțiunile bifate cu X, tabelul de linii, boxurile de
semnătură și secțiunea finanțe. Reutilizează tehnica din `src/lib/paymentAccountPdf.ts` (HTML node →
html2canvas → A4 jsPDF), ca diacriticele și formatul MDL să fie corecte. NU adaugă librărie PDF nouă.

## User stories

- **Ca** organizație, **vreau** un PDF identic cu formularul oficial, **pentru că** îl arhivăm și îl trimitem la donor exact în acel format.
- **Ca** finance, **vreau** ca semnăturile și sumele aprobate să apară pe PDF, **pentru că** e dovada aprobării.

## Acceptance criteria

- [ ] `src/lib/parPdf.ts` cu `buildParHtml(par): string` și `downloadParPdf(par): Promise<void>` (pattern din `paymentAccountPdf.ts`)
- [ ] PDF-ul conține, în ordine: titlul band „Payment Action Request (PAR) Form" + help link; grila antet (1–7); grupurile de checkbox 8 Purpose + 9 Charge To cu opțiunea aleasă marcată **X**; tabelul secțiunea 10 (Item#/Description/Quantity/Units/Est. Unit Price/Est. Total Price) + „TOTAL ESTIMATED COST" + footnota 10%; secțiunea 11 end-use; secțiunea 12 payee (Name/IDNP/IBAN/Bank); secțiunea 13 atașamente (radio + describe); secțiunile 14–15 boxuri semnătură (Name/Title/Date din `par_approvals`, „APPROVE" + nume pentru aprobatori suplimentari); secțiunea 16 grila finanțe (PAR BL/Date Received/Received By/Assigned To) + IBAN/Bank
- [ ] Format bani MDL = stil `paymentAccountPdf.money()` (`L 7 000`, mii grupate)
- [ ] Escape HTML pe toate câmpurile (anti-injectare) — reutilizează `esc()`
- [ ] Funcția `buildParHtml` e testabilă fără browser (string assertions)
- [ ] A4 portrait; lizibil; fără hex hardcodat în afara modulului de PDF (PDF-ul are paletă proprie ca în paymentAccountPdf)

## Files

**New:**
- `src/lib/parPdf.ts`
- `src/lib/__tests__/parPdf.test.ts`

## Tests

- **T-PAR-114-1** [blocant] Given un PAR complet, Then `buildParHtml` conține titlul, cele 16 secțiuni, opțiunea Purpose/Charge marcată X, tabelul + „TOTAL ESTIMATED COST", boxuri semnătură cu Name/Title/Date
- **T-PAR-114-2** [blocant] Given total 700000 MDL, Then format `L 7 000`
- **T-PAR-114-3** [normal] Given payee cu caractere speciale, Then escapate corect (fără injectare)

## DoD

- Build/typecheck verzi · reviewer APPROVED · personas salvate (manager verifică fidelitatea cu formularul)

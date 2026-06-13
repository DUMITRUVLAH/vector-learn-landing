---
id: ITPARK-202
title: "Import linii de venit: lipire din clipboard + CSV + (opțional) din invoices.ts"
milestone: ITPARK
phase: "C"
status: pending
attempts: 0
depends_on: ["ITPARK-201"]
spec: backlog/specs/ITPARK-202-revenue-import.md
core: backlog/fin/itpark/ITPARK-CORE.md
---

## Goal
Eliminarea transcrierii manuale: contabilul lipește din Excel/Word sau încarcă CSV, iar liniile
Anexei 3 se populează. Opțional, import din facturile existente (`invoices.ts`) pentru rezidenți deja
în sistem. Aceasta e principala economie de timp.

## User stories
- **Ca** contabil, **vreau** să lipesc tabelul din Excel direct, **pentru că** așa am deja datele și
  nu vreau să le retastez.
- **Ca** contabil cu firma deja în sistem, **vreau** să import facturile anului automat, **pentru că**
  e sursa exactă a Anexei 3.

## Acceptance criteria
- [ ] „Lipește din clipboard": parsare tab/`;`/`,` → mapare coloane (client, documente, obiect, CAEM, sumă, lună) cu preview înainte de salvare
- [ ] Import CSV: același mapper; rânduri invalide raportate per linie, nu crash; restul se importă
- [ ] Sugestie automată cod CAEM pe import (din ITPARK-203 dacă e gata; altfel gol, editabil)
- [ ] Import opțional din `invoices.ts`: `POST /api/itpark/engagements/:id/import-invoices?year=YYYY` → creează linii din facturile tenantului pe an (refolosește, nu redublează modelul de facturi). **Limitare documentată:** `invoices.ts` nu are `caemCode`, `serviceDescription`, sau `clientName` B2B — linia importată va conține `invoiceNumber` (din `documentRefs`), `issueDate` (→ luna), `amountCents`, dar `caemCode` va fi gol (contabilul completează manual ulterior). UI afișează un mesaj de avertisment „Linii importate necesită cod CAEM"
- [ ] Sumele se păstrează exact la bani (fără pierdere de precizie); 96 linii Vector Academy → 96 linii
- [ ] Rute montate; design-system, a11y, dark mode

## Files
**New:** `server/routes/itparkImport.ts`, `src/lib/api/itparkImport.ts`,
`src/components/itpark/PasteImportDialog.tsx`, `src/lib/itpark/parseRevenuePaste.ts`, teste
**Modified:** `server/app.ts` (mount), `RevenueLinesTable.tsx` (buton import)

## Tests
- **T-202-1** [blocant] lipire a 96 linii Vector Academy → 96 linii salvate, sume păstrate la bani
- **T-202-2** [normal] CSV cu un rând malformat → eroare clară pe acel rând, restul importate
- **T-202-3** [normal] import-invoices creează linii din facturi (când există)

## DoD
- check-route-mounts + check-refs + vitest verzi
- Reviewer APPROVED; integration-architect CONNECTED (reutilizează invoices.ts, fără COMPETING_SYSTEM)
- Persona reports salvate

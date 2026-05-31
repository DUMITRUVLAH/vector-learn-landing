---
id: CX-704
title: "CX: export CSV participanți cohortă — portat din copy-roas"
milestone: CX
phase: 1
status: pending
depends_on: [CX-703]
slug: export-csv
---

## Goal

Portează exportul CSV al listei de participanți dintr-o cohortă (din `handleExport` în
`src/pages/CX.tsx` copy-roas). E mic, dar e o cerere reală a managerului (listă de prezență /
import în alt tool).

## Idei de cod trase din copy-roas

`handleExport(edition)` în `src/pages/CX.tsx`:
- Coloane: `Nr., Nume Prenume, Email, Telefon, WhatsApp (Da/Nu), Sumă (EUR), Status, Sursa`.
- Status uman: won→„Achitat Full", achitat_12→„Achitat 1/2", pending_payment→„Cont Plată",
  altele→„Manual".
- Generează blob `text/csv;charset=utf-8;`, nume fișier `{curs}_{ediție}_cursanti.csv`, download via
  `<a download>`.

## In scope

- Buton „Export" activ în header-ul cohortei (placeholder-ul din CX-702 devine funcțional).
- Util `src/lib/exportCsv.ts` (escape corect pentru virgule/ghilimele/newline — copy-roas doar pune
  ghilimele pe nume; întărim escaping-ul).
- Mapare status → etichetă RO conform produsului nostru (full/half/pending/free).
- Sumă afișată în EUR din `amountCents`.

## Out of scope

- Export Excel/xlsx.
- Export pe mai multe cohorte simultan.

## User stories

- **US-1**: Ca manager, vreau să descarc lista de cursanți a unei cohorte ca CSV.

## Acceptance criteria

- [ ] AC1: Click „Export" descarcă CSV cu toate coloanele și rândurile cohortei curente.
- [ ] AC2: Valori cu virgulă/ghilimele sunt escapate corect (test pe nume „Popescu, Ion").
- [ ] AC3: Status mapat în RO; sumă în EUR din cenți.
- [ ] AC4: zero `any`; util testat unitar.

## Files

### New
- `src/lib/exportCsv.ts`
- `src/__tests__/cx/export-csv.test.ts`

### Modified
- `src/pages/app/CXPage.tsx` (header export button)
- `src/components/modules/cx/CohortStats.tsx` sau header component

## Tests

- **T-CX-704-1** `[blocant]` Export 2 participanți → CSV are header + 2 rânduri, coloane corecte.
- **T-CX-704-2** `[blocant]` Nume cu virgulă/ghilimele → escaping valid (round-trip parse).
- **T-CX-704-3** Status pending → „Cont Plată"; sumă 12000 cenți → „120".

## Definition of Done

- [ ] AC-uri; T-CX-704-1..3 trec; build+typecheck+lint+test verzi

---
id: CX-705
title: "CX: break-even + profit proiectat per cohortă — formule portate din copy-roas useProfitability"
milestone: CX
phase: 1
status: pending
depends_on: [CX-703]
slug: breakeven-badge
---

## Goal

Portează calculul de **break-even / profit proiectat per cohortă** din `useProfitability.ts`
(copy-roas) și afișează-l ca badge în bara de stat a cohortei (verde profit / roșu pierdere),
exact cum face `EditionContent` în `src/pages/CX.tsx`.

## Idei de cod / formule trase din copy-roas

`src/hooks/useProfitability.ts` → `courseBreakEven`:
- Costuri cohortă: `marketingCost` (din mapping campanie→curs × spend) + `mentorCost` + `roomCost`
  + `allocatedFixedCost` (cota din costurile fixe lunare, ponderată: curs=1.0, training=0.1,
    împărțită la `totalWeight` al lunii).
- `revenue = paidRevenue + organicRevenue` (won + achitat_12).
- `profit = revenue - totalCost`; `breakEvenDistance = -profit`.

`EditionContent` (CX.tsx) calculează un **profit proiectat** afișat live:
```
totalCosts = marketingCost + mentorCost + roomCost + allocatedFixedCost
projectedProfit = totalAmount + (expectedAmount - totalAmount) * 0.5 - totalCosts
```
(adică: încasat + jumătate din ce mai e de încasat − costuri). Portează această formulă ca badge.

**Adaptare la noi**: nu avem încă tot lanțul marketing (ROAS e separat, cum ai zis). Pentru această
fază, `marketingCost` poate fi 0 sau un câmp opțional pe cohortă (`marketingCostCents`), iar
`mentorCost`/`roomCost` vin din `cohorts` (CX-701). `allocatedFixedCost` rămâne opțional/0 dacă nu
există încă un tabel de costuri fixe lunare la noi (notează în „Backlog descoperit" dacă lipsește).

## In scope

- `server/lib/cohortBreakeven.ts`: funcție pură care, dat fiind costurile cohortei + sumele
  participanților (încasat, expected), întoarce `{ totalCost, revenue, projectedProfit,
  breakEvenDistance, isProfit }`. Testată cu valorile din copy-roas.
- Endpoint sau extindere a `GET /api/cohorts/:id/participants` să includă blocul de break-even
  (sau un `GET /api/cohorts/:id/breakeven`).
- Badge în `CohortStats.tsx`: lângă „Expected", afișează `+€X` (verde) / `-€X` (roșu) cu tokens
  semantice (`text-green-…`/`text-red-…` din paletă, dark mode).
- Câmp opțional `marketingCostCents` pe cohortă (migrație mică) dacă lipsește.

## Out of scope

- Integrarea ROAS / sync marketing real (modul separat, cum a cerut owner-ul).
- Tabel de costuri fixe lunare nou (dacă nu există, `allocatedFixedCost=0` + notă în backlog).

## User stories

- **US-1**: Ca manager, vreau să văd dintr-o privire dacă o cohortă e pe profit sau încă sub
  break-even, ca să decid dacă mai împing înscrieri.

## Acceptance criteria

- [ ] AC1: `cohortBreakeven` reproduce formula copy-roas: `projectedProfit = incasat +
      (expected-incasat)*0.5 - totalCosts` (test cu valori fixe identice).
- [ ] AC2: Badge verde când `isProfit`, roșu altfel; sumă formatată EUR.
- [ ] AC3: Costuri lipsă (marketing/fixed) tratate ca 0, fără crash.
- [ ] AC4: zero `any`; fără raw `.execute().rows`; tenant-safe.

## Files

### New
- `server/lib/cohortBreakeven.ts`
- `src/__tests__/cx/breakeven.test.ts`

### Modified
- `server/routes/cohortParticipants.ts` (sau rută nouă breakeven)
- `src/components/modules/cx/CohortStats.tsx`
- `server/db/schema/cohorts.ts` (+`marketingCostCents` dacă e nevoie) + migrație

## Tests

- **T-CX-705-1** `[blocant]` incasat=1000, expected=1600, costuri=1200 → projectedProfit = 1000 +
  600*0.5 - 1200 = 100; isProfit=true.
- **T-CX-705-2** `[blocant]` Costuri > venituri proiectate → isProfit=false, badge roșu.
- **T-CX-705-3** marketing/fixed lipsă → tratate ca 0, rezultat valid.

## Definition of Done

- [ ] AC-uri; T-CX-705-1..3 trec; build+typecheck+lint+test verzi
- [ ] Migration + portability verzi dacă s-a adăugat coloană (§3.5.1)

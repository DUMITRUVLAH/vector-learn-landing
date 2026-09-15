---
id: STOCK-107
title: Transferul între gestiuni
milestone: STOCK
phase: B
priority: P1
core_ref: [stock/STOCK-CORE.md §6.4, §4.2]
tests: inline (vezi „Tests")
depends_on: [STOCK-106]
status: pending
---

# STOCK-107 — Transfer între gestiuni

## Goal
Marfa se mută dintr-o gestiune în alta pe un aviz, cu o singură apăsare, fără ca valoarea totală
a stocului să se clintească.

## In scope
- `kind='transfer'`: `location_id` = sursa, `to_location_id` = destinația. La postare, fiecare
  rând produce **două** mișcări — `transfer_out` pe sursă și `transfer_in` pe destinație (tipuri
  care există deja în `fin_stock_movements`) — într-o singură tranzacție.
- Validări: `422 same_location` dacă sursa == destinația; ambele gestiuni active și ale
  tenantului; disponibil suficient în sursă pentru toate rândurile.
- Ecran: al treilea tab în `/business/crm/stoc` — „Transfer nou", cu sursa, destinația și
  rândurile preluate din soldul sursei (nu poți alege un articol care nu e în sursă).
- Stornarea transferului readuce marfa, prin motorul comun din STOCK-104.

## Out of scope
- Transfer „în tranzit" (marfă plecată, neajunsă), cu confirmare la destinație. Ar cere o a treia
  stare pe document și o gestiune-tampon. Se adaugă doar dacă apar transferuri între orașe unde
  drumul durează zile; azi gestiunile sunt în aceeași clădire.
- Transfer între tenanți — imposibil prin definiție (`tenant_id` e pe fiecare rând).

## Decizii, cu motivul
- **CMP-ul nu se schimbă la transfer, iar valoarea totală rămâne identică.** Consecința directă a
  deciziei din CORE §4.2 (evaluarea e pe entitate, nu pe depozit): o pereche de pantofi nu
  valorează altceva fiindcă a fost mutată în alt raft. Efectul practic e important — transferul
  devine o operațiune imposibil de folosit pentru a umfla sau a tăia rezultatul.
- **Un singur document, două mișcări.** Două documente (ieșire + intrare) ar putea rămâne
  desperecheate dacă al doilea pică.

## Acceptance criteria
- [ ] Transfer postat: sursa scade, destinația crește, cu aceeași cantitate
- [ ] `Σ (qty × avg_cost)` pe tenant **identică** înainte și după transfer
- [ ] `items.qty_on_hand` (totalul pe tenant) neschimbat de transfer
- [ ] Sursa == destinația → `422 same_location`
- [ ] Cantitate mai mare decât disponibilul sursei → 422, **zero** mișcări scrise
- [ ] Gestiune a altui tenant ca sursă sau destinație → **404**
- [ ] Stornarea readuce soldurile exact la valorile dinaintea transferului
- [ ] Destinația fără rând în `fin_stock_balances` primește unul creat la postare (upsert)

## Tests
`server/__tests__/stock-transfer.routes.test.ts` (nou).

Blocante:
1. `[blocant]` **invariantul de valoare**: valoarea stocului calculată înainte == după transfer,
   la cent.
2. `[blocant]` soldurile: sursa −N, destinația +N; jurnalul are exact două mișcări per rând.
3. `[blocant]` atomicitate: 3 rânduri, al 2-lea fără stoc în sursă → 422, zero mișcări.
4. `[blocant]` `same_location` → 422.
5. `[blocant]` destinație fără balanță preexistentă → se creează rândul, cu cantitatea corectă.
6. `[blocant]` stornare → solduri revenite; originalul `reversed`.
7. `[blocant]` izolare: gestiunea lui B ca destinație → 404, nicio mișcare scrisă.

## Files
- `server/lib/finStockPosting.ts` (ramura `transfer`)
- `server/routes/finStockDocs.ts`
- `src/pages/business/crm/CrmStockPage.tsx` (tabul de transfer)
- `server/__tests__/stock-transfer.routes.test.ts` (nou)

## DoD
Standard.

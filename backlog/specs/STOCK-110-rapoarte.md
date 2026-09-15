---
id: STOCK-110
title: Rapoarte — fișa de magazie, stoc pe gestiune, valoare, sub pragul minim
milestone: STOCK
phase: D
priority: P1
core_ref: [stock/STOCK-CORE.md §8]
tests: inline (vezi „Tests")
depends_on: [STOCK-108]
status: pending
---

# STOCK-110 — Rapoartele de stoc

## Goal
Cele patru întrebări care se pun într-o firmă — *cât am*, *unde*, *cât valorează*, *ce trebuie
comandat* — primesc fiecare un raport care se închide la cent.

## In scope
- **Fișa de magazie** — `GET /api/fin/stock/reports/ledger?itemId=&locationId=&from=&to=`:
  sold inițial + rândurile jurnalului cu sold rulant (dată, document cu număr și tip, intrare,
  ieșire, sold după mișcare, cost unitar, valoare) + sold final. Ordonare după `moved_at`, apoi
  după `id` (stabilă la mișcări în aceeași secundă).
- **Stoc curent pe gestiune** — `GET /api/fin/stock/reports/on-hand?locationId=&category=&onlyWithStock=&onlyProducts=`:
  matrice articol × gestiune cu pe mână, rezervat, disponibil, CMP, valoare; totaluri pe coloană.
- **Valoarea stocului** — se **extinde ruta existentă** `GET /api/fin/inventory/stock-value`
  (`server/routes/finInventory.ts`) cu defalcare pe gestiune și pe categorie. Nu se scrie o rută
  nouă. Pentru valoarea la o dată din trecut se refolosește
  `GET /api/fin/inventory/report/stock-snapshot`, care reconstruiește deja soldul din jurnal.
- **Sub pragul minim** — `GET /api/fin/stock/reports/below-min`: articole cu
  `qty_on_hand ≤ min_qty_alert`, `min_qty_alert > 0` și `is_stock_tracked=true`. Pragul e pe
  articol, la nivel de tenant.
- **Mișcări în perioadă** — se extinde ruta existentă `GET /api/fin/inventory/report/period` cu
  filtrele `locationId` și `docId`.
- Paginare pe fișa de magazie și pe jurnal (`page`, `limit`, max 100 — ca în rutele existente).

## Out of scope
- Rotația stocului, stocul mort, analiza ABC, marja pe produs. Toate cer istoric de vânzări pe
  care modulul abia începe să-l producă; azi ar fi grafice pe zero (CORE §8.5).
- Export PDF. Export CSV, da — e o linie de cod peste datele deja calculate; PDF cere șablon.
- Prag de reaprovizionare per gestiune — nimeni nu va întreține un prag per gestiune per articol.

## Decizii, cu motivul
- **Se extind rutele existente `stock-value` și `report/period`, nu se scriu altele.** Două rute
  care calculează valoarea stocului ar da, la un moment dat, două cifre diferite — iar cea
  greșită va fi crezută.
- **Fișa de magazie se calculează din `qty_signed`**, nu din `qty` (vezi STOCK-102 și CORE §2.6).
- **Soldul inițial se reconstruiește din jurnal**, nu se ține un sold pe lună. Un sold stocat pe
  perioade cere închidere de lună, adică un modul în plus.
- **Fără cache.** Volumele sunt de ordinul miilor de mișcări; un cache ar aduce raportări
  învechite pentru un câștig pe care nimeni nu-l simte.

## Acceptance criteria
- [ ] Fișa se închide: `sold_inițial + Σ intrări − Σ ieșiri = sold_final`, egal cu balanța curentă
      când perioada se termină azi
- [ ] Ordonarea e stabilă la mișcări cu același `moved_at`
- [ ] Stoc pe gestiune: `Σ` pe gestiuni == totalul de pe articol, pentru fiecare articol
- [ ] Valoarea: `Σ (qty × avg_cost)` == cifra întoarsă de `stock-value`, cu defalcare care
      însumează la total
- [ ] `stock-snapshot` la data de azi == valoarea curentă
- [ ] „Sub prag" nu include servicii (`is_stock_tracked=false`) și nici articole cu prag 0
- [ ] Toate rutele filtrate pe `tenant_id`; niciun cent al altui tenant în niciun total
- [ ] Contractele rutelor extinse rămân compatibile (câmpurile vechi, aceleași nume)

## Tests
`server/__tests__/stock-reports.routes.test.ts` (nou).

Blocante:
1. `[blocant]` **fișa se închide pe date amestecate**: fixture cu 30 de operațiuni generate
   (recepții, vânzări, transferuri, ajustări) → `sold_inițial + intrări − ieșiri == sold_final`
   pe fiecare (articol, gestiune).
2. `[blocant]` fișa pe o perioadă din mijloc: soldul inițial calculat din jurnal == soldul real la
   acel moment.
3. `[blocant]` `Σ` pe gestiuni == `items.qty_on_hand`, pentru fiecare articol.
4. `[blocant]` valoarea totală == suma manuală; defalcarea pe gestiune însumează la total.
5. `[blocant]` `stock-snapshot` la data de azi == `stock-value` de azi.
6. `[blocant]` „sub prag": articol cu `min=10`, `qty=10` apare; `qty=11` nu; serviciul nu apare.
7. `[blocant]` regresie de contract: răspunsul vechi al lui `stock-value` (fără parametri noi)
   are exact aceleași câmpuri ca înainte.
8. `[blocant]` izolare: rapoartele lui A nu conțin niciun articol și niciun cent al lui B.

## Files
- `server/routes/finStockReports.ts` (nou) + `server/app.ts`
- `server/routes/finInventory.ts` (`stock-value` și `report/period` extinse)
- `server/lib/finStockReports.ts` (nou — calculele, testabile fără HTTP)
- `src/lib/api/finStock.ts`
- `server/__tests__/stock-reports.routes.test.ts` (nou)

## DoD
Standard.

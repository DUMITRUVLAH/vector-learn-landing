---
id: STOCK-102
title: Sold pe gestiune (fin_stock_balances) + qty_signed + migrarea stocului existent
milestone: STOCK
phase: A
priority: P0
core_ref: [stock/STOCK-CORE.md §2.3, §2.6]
tests: inline (vezi „Tests")
depends_on: [STOCK-101]
status: pending
---

# STOCK-102 — Soldul pe gestiune

## Goal
Cantitatea se ține de acum pe articol × gestiune, iar jurnalul devine o sursă pe care se poate
face sumă. Stocul care există azi nu se pierde: se mută integral în gestiunea principală.

## In scope
- Tabelă nouă `fin_stock_balances` (CORE §2.3) în `server/db/schema/finStockBalances.ts`:
  `item_id`, `location_id`, `qty_on_hand`, `qty_reserved`, cu
  `UNIQUE (tenant_id, item_id, location_id)`.
- Coloane noi pe `fin_stock_movements` (`server/db/schema/finInventory.ts`): `location_id`,
  `doc_id` (nullable acum, FK adăugat la STOCK-104), `qty_signed`.
- **Migrarea datelor**, în trei pași, în aceeași migrare:
  1. pentru fiecare articol, un rând în `fin_stock_balances` cu `location_id` = gestiunea
     `is_default` a tenantului și `qty_on_hand` = `fin_inventory_items.qty_on_hand`;
  2. `fin_stock_movements.location_id` = aceeași gestiune implicită, pentru toate mișcările
     istorice;
  3. `qty_signed` completat din datele vechi: `+qty` pentru `purchase`/`transfer_in`, `−qty`
     pentru `sale`/`transfer_out`, iar pentru `adjustment` se păstrează semnul existent al lui
     `qty` (ruta actuală chiar scrie negativ acolo).
- `server/lib/finStockBalances.ts` (nou): `applyBalanceDelta(tx, {tenantId, itemId, locationId, qtyDelta})`
  — upsert pe balanță + actualizarea totalului de pe articol, într-o tranzacție primită ca
  parametru. Toate scrierile de stoc trec prin ea, inclusiv cele din
  `server/routes/finInventory.ts`.
- `GET /api/fin/stock/balances?itemId=&locationId=` — citirea soldurilor, cu `qty_available`
  calculat.
- Comentariu în schemă pe `fin_stock_movements.qty`: „istorică; nu o folosi la agregări, folosește
  `qty_signed`".

## Out of scope
- Documente de stoc (STOCK-104) — rutele existente scriu în continuare direct în jurnal, dar
  acum prin `applyBalanceDelta`.
- Rezervări — coloana `qty_reserved` se creează, dar rămâne 0 până la STOCK-109.

## Decizii, cu motivul
- **`fin_inventory_items.qty_on_hand` rămâne**, ca total pe tenant. E o redundanță deliberată:
  rutele și ecranele existente (`/api/fin/inventory/items`, `stock-value`, `InventoryPage.tsx`)
  o citesc azi, iar golirea ei ar rupe ce funcționează. Prețul redundanței e testul de
  consistență de mai jos, care e blocant.
- **`qty_available` nu e coloană.** Se calculează la citire. A treia cifră derivată e a treia
  care se poate desincroniza.
- **`qty_signed` e coloană nouă, nu corectarea lui `qty`.** Rescrierea lui `qty` ar schimba
  sensul datelor citite de ecranele existente; coloana nouă lasă vechiul contract în pace.

## Acceptance criteria
- [ ] `fin_stock_balances` creată, cu `tenant_id` + index + unicitatea (tenant, item, locație)
- [ ] După migrare: `Σ balances.qty_on_hand = items.qty_on_hand` pentru FIECARE articol
- [ ] Nicio mișcare istorică nu rămâne cu `location_id IS NULL`
- [ ] `Σ qty_signed` pe (item, locație) == `balances.qty_on_hand` pentru fiecare pereche
- [ ] Rutele existente din `server/routes/finInventory.ts` (`POST /movements`,
      `hook/purchase`, `hook/invoice-issued`) actualizează și balanța, prin `applyBalanceDelta`
- [ ] `GET /api/fin/stock/balances` e tenant-scoped; id străin → 404
- [ ] `ENSURE_STATEMENTS` pentru tabela nouă; `export *` prezent; migrare cu breakpoint-uri

## Tests
Extinde `server/__tests__/stock-isolation.routes.test.ts` + fișier nou
`server/__tests__/stock-balances.test.ts`.

Blocante:
1. `[blocant]` **consistență după migrare**: fixture cu articole și mișcări create prin schema
   veche → după migrări, `Σ balances = items.qty_on_hand` pe fiecare articol.
2. `[blocant]` **consistență după operațiuni**: 20 de mișcări aleatoare (intrări, ieșiri,
   ajustări pozitive și negative) → invariantul de mai sus ține la final.
3. `[blocant]` `Σ qty_signed` din jurnal == soldul balanței, pe fiecare (item, locație).
4. `[blocant]` o ajustare negativă contribuie corect la sumă (regresie pe bug-ul de `qty`).
5. `[blocant]` `applyBalanceDelta` care ar duce soldul sub zero aruncă și NU scrie nimic
   (verificat în DB după apel).
6. `[blocant]` izolare: `GET /api/fin/stock/balances?itemId=<al lui B>` ca A → 404.

## Files
- `server/db/schema/finStockBalances.ts` (nou) + `index.ts`
- `server/db/schema/finInventory.ts` (3 coloane noi + comentariul pe `qty`)
- `drizzle/0177_fin_stock_balances.sql` — tabela, coloanele noi ȘI backfill-ul, cu
  `--> statement-breakpoint` între statements
- `server/lib/finStockBalances.ts` (nou)
- `server/routes/finInventory.ts` (trece pe `applyBalanceDelta`)
- `server/routes/finStockLocations.ts` sau un router nou pentru `/balances` + `server/app.ts`
- `server/db/ensure/stock.ts`
- `server/__tests__/stock-balances.test.ts` (nou), `stock-isolation.routes.test.ts` (extins)

## DoD
Standard.

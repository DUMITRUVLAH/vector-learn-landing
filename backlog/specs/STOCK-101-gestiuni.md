---
id: STOCK-101
title: Gestiuni (fin_stock_locations) + testul de izolare multi-tenant
milestone: STOCK
phase: A
priority: P0
core_ref: [stock/STOCK-CORE.md §2.2, §4.7]
tests: inline (vezi „Tests")
depends_on: []
status: pending
---

# STOCK-101 — Gestiuni + izolarea multi-tenant

## Goal
Stocul capătă dimensiunea „unde". Azi `fin_inventory_items.qty_on_hand` e o singură cifră pe
tenant, fără loc — deci întrebarea „ce am în magazin vs. în depozit" n-are răspuns. Item-ul
introduce gestiunile și, odată cu ele, testul de izolare pe care se sprijină tot modulul.

## In scope
- Schemă nouă `server/db/schema/finStockLocations.ts` → `fin_stock_locations` cu coloanele din
  CORE §2.2 (`code`, `name`, `branch_id`, `manager_user_id`, `is_default`, `is_active`).
- `export * from "./finStockLocations";` în `server/db/schema/index.ts`, ACELAȘI commit.
- Migrare (prefix > maximul de pe `origin/main`) + intrare în `server/db/ensure/stock.ts`,
  referită din `server/db/sync-schema.ts` (tabelă nouă → `CREATE TABLE IF NOT EXISTS`, coloanele
  nu se vindecă singure).
- Rute `server/routes/finStockLocations.ts`, montate la `/api/fin/stock/locations` în
  `server/app.ts`:
  `GET /` (implicit doar active, `?includeInactive=1`), `POST /`, `PATCH /:id`,
  `POST /:id/archive`, `POST /:id/restore`, `POST /:id/set-default`.
- Migrarea de date: fiecare tenant care are măcar un rând în `fin_inventory_items` primește o
  gestiune `code='PRINCIPAL'`, `name='Gestiune principală'`, `is_default=true`.
- Două drepturi noi în `server/lib/crm/permissions.ts`: `stock.view` și `stock.manage`, cu
  distribuția pe roluri din CORE §4.7. Citirile cer `stock.view`, scrierile `stock.manage`.
- Ecran minimal `/business/crm/stoc/gestiuni` (`src/pages/business/crm/CrmStockLocationsPage.tsx`):
  listă + adaugă + editează + arhivează + „setează ca implicită".

## Out of scope
- Solduri pe gestiune (STOCK-102) — aici gestiunea e doar un nomenclator.
- Legarea gestiunii de `fin_stock_movements` (STOCK-102).
- Structură ierarhică de gestiuni (gestiune în gestiune) — nimeni n-a cerut-o și ar cere un
  arbore în fiecare raport.

## Decizii, cu motivul
- **Arhivare, nu DELETE.** O gestiune ștearsă ar lăsa mișcări istorice fără loc. Același
  raționament ca la `crm_products` (vezi antetul din `server/routes/crmProducts.ts`).
- **`is_default` se impune în rută, nu printr-un index parțial unic.** Un index unic ar bloca
  tranziția când implicitul se mută; ruta debifează precedenta în aceeași tranzacție.
- **`branch_id` fără FK hard**, ca la `fin_stock_movements.branch_id` — evită dependința
  circulară de import și rămâne consistent cu ce e deja acolo.

## Acceptance criteria
- [ ] `fin_stock_locations` creată prin migrare, cu `tenant_id NOT NULL` + index pe `tenant_id`
      + `UNIQUE (tenant_id, code)`
- [ ] Toate rutele filtrează pe `tenant_id`; un id al altui tenant → **404**, nu 403
- [ ] `POST /:id/set-default` lasă exact o gestiune implicită per tenant (verificat în DB)
- [ ] Cod duplicat în același tenant → `409 code_taken`; același cod în tenant diferit → 201
- [ ] Migrarea de date creează gestiunea `PRINCIPAL` pentru fiecare tenant cu articole existente
- [ ] `stock.view` fără `stock.manage`: citește, dar `POST`/`PATCH` → 403; `student`/`parent` → 403
- [ ] `npm run db:reset && npm run db:seed` verzi; prefix de migrare > max pe `origin/main`
- [ ] `export *` în `server/db/schema/index.ts` + `ENSURE_STATEMENTS` prezente
- [ ] Ruta montată în `server/app.ts` (`check-route-mounts` verde)

## Tests
`server/__tests__/stock-isolation.routes.test.ts` — **fișier nou, scris ÎNAINTE de rute**, două
tenant-uri complete în PGlite, după modelul din `server/__tests__/crm-lead-product.routes.test.ts`.

Blocante:
1. `[blocant]` `GET /api/fin/stock/locations` ca tenant A nu întoarce nicio gestiune a lui B.
2. `[blocant]` `PATCH /api/fin/stock/locations/:id` cu id-ul unei gestiuni a lui B → **404**, iar
   rândul lui B e neschimbat la re-citire din DB.
3. `[blocant]` `POST /:id/archive` pe gestiunea lui B → 404, rândul rămâne `is_active=true`.
4. `[blocant]` `POST /:id/set-default` mută implicitul: vechea implicită devine `false` în
   aceeași tranzacție; nu rămân două implicite.
5. `[blocant]` cod duplicat în tenant → 409; același cod în alt tenant → 201.
6. `[blocant]` `receptionist` (are `stock.view`, nu `stock.manage`) → `GET` 200, `POST` 403;
   `parent` → 403 peste tot.
7. `[blocant]` migrarea de date: un tenant cu articole preexistente are, după `db:reset`, exact
   o gestiune `is_default=true`.

## Files
- `server/db/schema/finStockLocations.ts` (nou)
- `server/db/schema/index.ts` (export)
- `server/db/ensure/stock.ts` (nou) + `server/db/sync-schema.ts` (import)
- `drizzle/0176_fin_stock_locations.sql` (sau următorul prefix liber)
- `server/routes/finStockLocations.ts` (nou) + `server/app.ts` (montare)
- `server/lib/crm/permissions.ts` (2 drepturi noi)
- `src/lib/api/finStock.ts` (nou)
- `src/pages/business/crm/CrmStockLocationsPage.tsx` (nou) + `src/App.tsx` (rută)
- `server/__tests__/stock-isolation.routes.test.ts` (nou)

## DoD
Standard (vezi `backlog/stock/BUILD-SEQUENCE.md`).

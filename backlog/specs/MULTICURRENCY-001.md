---
id: MULTICURRENCY-001
title: Schema fin_exchange_rates — cursuri BNM zilnice + migrare + seed
milestone: FIN
phase: multicurrency
status: pending
depends_on: []
spec: backlog/specs/MULTICURRENCY-001.md
---

## Goal

Creează tabela `fin_exchange_rates` care stochează cursurile BNM (Banca Națională a Moldovei)
zilnice pentru perechi valutare (MDL/EUR, MDL/USD, MDL/RON etc.), plus migrarea Drizzle și un
seed cu date de test. Aceasta este fundația pentru revaluarea soldurilor multivalutare
(MULTICURRENCY-002) și pentru postarea diferențelor de curs în LEDGER.

## User stories

- Ca director financiar, vreau să văd cursul BNM al zilei pentru EUR/MDL, astfel încât
  rapoartele să reflecte valoarea reală în MDL a soldurilor în valută.
- Ca sistem, vreau să import zilnic cursurile BNM via endpoint REST, astfel încât datele să
  fie mereu actuale fără intervenție manuală.
- Ca auditor, vreau un jurnal complet al cursurilor BNM pe dată, astfel încât să pot reconstitui
  valoarea unui sold la orice dată istorică.
- Ca administrator, vreau să pot adăuga manual un curs dacă importul BNM eșuează, astfel încât
  fluxul financiar să nu fie blocat.

## Acceptance criteria

- [ ] Tabela `fin_exchange_rates` există cu coloanele: `id` (uuid PK), `tenant_id` (FK tenants,
  cascade), `currency_from` varchar(3), `currency_to` varchar(3), `rate` numeric(18,6),
  `rate_date` date (NOT NULL), `source` varchar(20) default 'BNM', `created_at` timestamptz.
- [ ] Index unic pe `(tenant_id, currency_from, currency_to, rate_date)` — un singur curs per
  pereche per zi per tenant.
- [ ] Fișierul schema `server/db/schema/finExchangeRates.ts` exportă `finExchangeRates`,
  `FinExchangeRate`, `NewFinExchangeRate`.
- [ ] `server/db/schema/index.ts` are `export * from "./finExchangeRates"`.
- [ ] Migrare `drizzle/0115_fin_exchange_rates.sql` cu CREATE TABLE + index unic + statement-breakpoint.
- [ ] `meta/_journal.json` are entry `{ idx: 115, tag: "0115_fin_exchange_rates" }` (fără duplicate).
- [ ] Seed `server/db/seed.ts` (sau `scripts/seed-exchange-rates.ts`) inserează cel puțin 5 rate
  istorice: EUR/MDL, USD/MDL, RON/MDL pentru ultimele 3 zile calendaristice cu valori realiste.
- [ ] Rute API montate în `server/app.ts`:
  - `GET  /api/fin/exchange-rates?from=EUR&to=MDL&date=2026-06-13` → rate + `{ rate, rate_date, source }`
  - `GET  /api/fin/exchange-rates/latest?from=EUR&to=MDL` → ultimul curs disponibil
  - `POST /api/fin/exchange-rates` → inserare manuală (rol: owner sau fin_admin)
- [ ] Toate rutele sunt tenant-scoped (folosesc `tenantId` din sesiune).
- [ ] Routerul este exportat ca `finExchangeRatesRoutes` și montat cu comentariul `// MULTICURRENCY-001`.
- [ ] TypeScript strict — zero `any`, zero `ts-ignore`.
- [ ] Design-system tokens în orice UI (dacă există pagina de administrare cursuri).

## Files

- `server/db/schema/finExchangeRates.ts` — schema Drizzle
- `server/db/schema/index.ts` — adaugă export
- `drizzle/0115_fin_exchange_rates.sql` — migrare SQL
- `drizzle/meta/0115_snapshot.json` — snapshot Drizzle
- `drizzle/meta/_journal.json` — entry nouă
- `server/routes/finExchangeRates.ts` — rute API
- `server/app.ts` — mount rute
- `server/__tests__/finExchangeRates.test.ts` — teste unitare
- `src/lib/api/finExchangeRates.ts` — client API frontend (optional, pentru MULTICURRENCY-002)

## Tests

- **T-MULTI001-1** [blocant] Given: tabela `fin_exchange_rates` nu există, When: rulăm migrarea 0115, Then: tabela e creată cu toate coloanele + indexul unic, și `db:reset` trece fără erori.
- **T-MULTI001-2** [blocant] Given: server pornit + auth valid, When: `GET /api/fin/exchange-rates?from=EUR&to=MDL&date=<ieri>`, Then: răspuns 200 cu `{ rate, rate_date, source: "BNM" }`.
- **T-MULTI001-3** [blocant] Given: server pornit + auth valid, When: `POST /api/fin/exchange-rates` cu `{ currency_from: "USD", currency_to: "MDL", rate: 18.5, rate_date: "2026-06-14" }`, Then: 201 + rate salvat în DB.
- **T-MULTI001-4** [blocant] Given: request fără autentificare, When: `GET /api/fin/exchange-rates/latest`, Then: 401 Unauthorized.
- **T-MULTI001-5** [normal] Given: inserăm duplicate `(tenant_id, EUR, MDL, 2026-06-13)`, When: a doua inserare, Then: DB returnează eroare unique_violation (sau upsert ignoră).
- **T-MULTI001-6** [normal] Given: schema `finExchangeRates.ts` e scrisă, When: verificăm `server/db/schema/index.ts`, Then: conține `export * from "./finExchangeRates"`.

## DoD

- Migrare commitată; `db:reset && db:seed` trece.
- Rute montate; smoke test login + `GET /api/fin/exchange-rates/latest` → 200.
- Zero `any`; build + typecheck + lint verde.
- Teste unitare ≥ 4 scenariu verzi.
- PR deschis pe branch `feat/FIN-multicurrency`.

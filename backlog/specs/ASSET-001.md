---
id: ASSET-001
title: "Schema fin_assets + fin_depreciation_entries + migrare 0116 + seed"
milestone: FIN
phase: "12"
status: pending
depends_on: [CORE-001]
spec: backlog/specs/ASSET-001.md
branch: feat/FIN-asset
---

## Goal

Creează fundația modulului de Active Fixe (FIN-CORE §1.12):
- Schema DB: tabela `fin_assets` (active fixe ale centrului educativ) + `fin_depreciation_entries`
  (înregistrările de amortizare DETERMINIST per asset per lună)
- Migrare 0116_fin_assets.sql — next free prefix după 0115_fin_payroll.sql
- Seed date de test: 3 active (laptop, proiector, autoturism) cu valori, dată punere în funcțiune,
  metodă și durată amortizare
- Schema exportată din server/db/schema/index.ts (schema-index rule §3.5.1)
- Drizzle relations setate corect

FIN-CORE §1.12: un activ fix are: denumire, valoare intrare (cenți), dată punere în funcțiune,
metodă amortizare (liniar | degresiv), durată amortizare (luni), valoare reziduală (cenți),
status (activ | amortizat complet | vândut | casat). Înregistrările de amortizare: luna,
suma amortizată (cenți), valoarea rămasă după înregistrare.

FIN-CORE regula #4: calculele sunt DETERMINISTE, nu AI.
FIN-CORE regula #3: amortizarea postează cheltuiala în fin_expenses (ASSET-002 o va face).

---

## User stories

- Ca **contabil**, vreau să înregistrez activele fixe ale centrului cu valoarea de intrare și
  metoda de amortizare, pentru că trebuie să le evidențiez în bilanț.
- Ca **director**, vreau să văd totalul activelor fixe și valoarea lor netă curentă, pentru că
  afectează situația financiară a centrului.
- Ca **auditor**, vreau că fiecare activ are o înregistrare clară a amortizărilor lunare,
  pentru că pot verifica calculul față de normele contabile.

---

## Acceptance criteria

- [ ] AC1: Tabelă `fin_assets` cu coloane: id (uuid PK), tenant_id (FK tenants cascade delete),
  name (varchar 255 NOT NULL), description (text), acquisition_date (date NOT NULL),
  acquisition_cost_cents (integer NOT NULL, ≥ 0), residual_value_cents (integer NOT NULL default 0),
  useful_life_months (integer NOT NULL, > 0), depreciation_method (enum: linear | declining_balance),
  status (enum: active | fully_depreciated | sold | scrapped default active),
  category (varchar 100 — ex: IT, mobilier, transport, echipament),
  notes (text), created_at, updated_at.
- [ ] AC2: Tabelă `fin_depreciation_entries` cu coloane: id (uuid PK), tenant_id (FK tenants cascade),
  asset_id (FK fin_assets cascade delete), period_month (varchar 7 YYYY-MM NOT NULL),
  depreciation_cents (integer NOT NULL, ≥ 0), book_value_cents (integer NOT NULL, ≥ 0),
  expense_id (uuid nullable — FK spre fin_expenses când ASSET-002 îl postează),
  notes (text), created_at.
  Index unic: (asset_id, period_month) — un activ nu poate fi amortizat de două ori pe aceeași lună.
- [ ] AC3: Migrare 0116_fin_assets.sql cu statement-breakpoints corecte (§3.5.1 migration-breakpoint rule).
  `npm run db:reset && npm run db:seed` trece după adăugarea migrației.
- [ ] AC4: server/db/schema/finAssets.ts exportat în server/db/schema/index.ts (schema-index rule §3.5.1).
- [ ] AC5: Drizzle relations: finAssets → finDepreciationEntries (one-to-many), finDepreciationEntries → finAssets (many-to-one).
- [ ] AC6: Seed în server/db/seed.ts — adaugă 3 active de test pentru tenant demo:
  { name: "Laptop Dell", acquisition_cost_cents: 1_200_000, useful_life_months: 36, method: linear },
  { name: "Proiector Epson", acquisition_cost_cents: 800_000, useful_life_months: 60, method: linear },
  { name: "Autoturism VW", acquisition_cost_cents: 18_000_000, useful_life_months: 60, method: declining_balance }.
- [ ] AC7: TypeScript inference types exportate: FinAsset, InsertFinAsset, FinDepreciationEntry, InsertFinDepreciationEntry.
- [ ] AC8: Tenant isolation: toate coloanele tenant_id prezente, relații FK corecte, zero `any`.

---

## Files to create / modify

**Create:**
- `server/db/schema/finAssets.ts` — schema fin_assets + fin_depreciation_entries + types + relations
- `drizzle/0116_fin_assets.sql` — migrare manuală (drizzle generate nu se aplică, hand-write per §3.5.1)
- `src/__tests__/fin/fin-assets-schema.test.ts` — test schema existență + structură

**Modify:**
- `server/db/schema/index.ts` — `export * from "./finAssets";`
- `drizzle/meta/_journal.json` — append entry idx 116, tag "0116_fin_assets"
- `server/db/seed.ts` — adaugă seed active fixe demo

---

## Tests

- **T-ASSET-001-1** `[blocant]` Migration discipline: `drizzle/0116_fin_assets.sql` există și conține
  `CREATE TABLE "fin_assets"` și `CREATE TABLE "fin_depreciation_entries"`.
- **T-ASSET-001-2** `[blocant]` `_journal.json` conține entry cu idx=116 și tag="0116_fin_assets".
- **T-ASSET-001-3** `[blocant]` Schema: `finAssets` și `finDepreciationEntries` sunt exportate din
  `server/db/schema/index.ts` (nu undefined).
- **T-ASSET-001-4** [normal] finAssets are coloanele: id, tenant_id, name, acquisition_cost_cents,
  useful_life_months, depreciation_method, status, created_at.
- **T-ASSET-001-5** [normal] finDepreciationEntries are constraint unic (asset_id, period_month).

---

## Definition of Done

- [ ] AC1-AC8 implementate
- [ ] T-ASSET-001-1..3 trec (blocante)
- [ ] Build + typecheck + lint verzi
- [ ] server/db/schema/index.ts include export finAssets
- [ ] _journal.json are idx 116 fără duplicate

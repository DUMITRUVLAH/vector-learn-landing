---
id: FISC-001
title: "Schema fin_tax_periods + fin_tax_declarations + migrare 0121"
milestone: FIN
phase: "10"
status: pending
depends_on: [REGISTRY-001]
spec: backlog/specs/FISC-001.md
branch: feat/FIN-fisc
---

## Goal

Creează infrastructura de date pentru modulul fiscal FinDesk: tabelele `fin_tax_periods` (perioade
fiscale: lunar/trimestrial/anual) și `fin_tax_declarations` (declarații generate per perioadă:
TVA12-MD, D394-RO, D301-RO), plus seed-ul de date inițiale. Migrarea are prefixul 0121 (> max 0120).

Calculele fiscale sunt DETERMINISTE în cod — AI nu computează TVA sau impozite (FIN-CORE regula #4).

---

## User stories

- Ca **contabil**, vreau să definesc perioadele fiscale (lună, trimestru, an) pentru care generez declarații, pentru că fiecare perioadă fiscală este o unitate de raportare separată.
- Ca **director financiar**, vreau să văd statusul declarațiilor pe fiecare perioadă, pentru că trebuie să știu ce a fost depus la ANAF/SFS și ce e în așteptare.
- Ca **contabil**, vreau ca sistemul să știe dacă un tenant e RO sau MD, pentru că declarațiile diferă (D394/D301 vs TVA12).
- Ca **administrator**, vreau ca schema să fie multi-tenant și să izoleze datele fiscale ale fiecărei organizații, pentru că datele fiscale sunt confidențiale.

---

## Acceptance criteria

- [ ] Tabelul `fin_tax_periods` creat cu coloanele: `id UUID PK`, `tenant_id UUID FK→tenants`, `period_type ENUM('monthly','quarterly','annual')`, `year INTEGER`, `month INTEGER nullable`, `quarter INTEGER nullable`, `start_date DATE`, `end_date DATE`, `status ENUM('open','locked','filed')`, `created_at`, `updated_at`
- [ ] Tabelul `fin_tax_declarations` creat cu coloanele: `id UUID PK`, `tenant_id UUID FK→tenants`, `period_id UUID FK→fin_tax_periods`, `declaration_type ENUM('tva12_md','d394_ro','d301_ro','income_md')`, `status ENUM('draft','ready','filed')`, `filed_at TIMESTAMP nullable`, `notes TEXT nullable`, `payload JSONB` (date calculare stocate), `created_at`, `updated_at`
- [ ] Enum-uri create idempotent cu `DO $$ BEGIN IF NOT EXISTS … END $$;`
- [ ] Indexuri: `fin_tax_periods_tenant_idx (tenant_id)`, `fin_tax_periods_tenant_year_idx (tenant_id, year)`, `fin_tax_decl_tenant_idx (tenant_id)`, `fin_tax_decl_period_idx (period_id)`
- [ ] Fișierul `server/db/schema/finTax.ts` exportă toate tabelele și tipurile
- [ ] `server/db/schema/index.ts` include `export * from "./finTax";`
- [ ] Migrarea `drizzle/0121_fin_tax.sql` cu statement-breakpoints corecte
- [ ] `drizzle/meta/_journal.json` actualizat cu entry idx=121
- [ ] `npm run db:reset && npm run db:seed` trece fără erori
- [ ] Tenant isolation: orice query trebuie să filtreze după `tenant_id`

---

## Files to create / modify

**Create:**
- `server/db/schema/finTax.ts` — schema Drizzle pentru `fin_tax_periods` + `fin_tax_declarations`
- `drizzle/0121_fin_tax.sql` — migrare SQL cu breakpoints
- `drizzle/meta/0121_snapshot.json` — snapshot Drizzle (structura standard, poate fi minimal)

**Modify:**
- `server/db/schema/index.ts` — adaugă `export * from "./finTax";`
- `drizzle/meta/_journal.json` — adaugă entry `{idx: 121, version: "7", when: <timestamp>, tag: "0121_fin_tax"}`

---

## Tests

- **T-FISC-001-1** [blocant] Given schema finTax.ts importat, When TypeScript compilează, Then zero erori TS (build gate)
- **T-FISC-001-2** [blocant] Given migrare 0121_fin_tax.sql, When `npm run db:reset`, Then tabele `fin_tax_periods` și `fin_tax_declarations` există
- **T-FISC-001-3** [blocant] Given `_journal.json`, When verificat, Then idx=121 prezent și fără duplicate
- **T-FISC-001-4** [blocant] Given schema/index.ts, When importat, Then `finTaxPeriods` și `finTaxDeclarations` exportate
- **T-FISC-001-5** [normal] Given tenant_id diferite, When insert fin_tax_periods, Then izolat per tenant (FK cascade)
- **T-FISC-001-6** [normal] Given fin_tax_declarations.payload JSONB, When insert cu payload `{}`, Then stored și retrieval corect

---

## Definition of Done

- Migrare SQL 0121 committă cu statement-breakpoints, idx corect în journal
- Schema Drizzle compilează fără erori
- `index.ts` exportă `finTax`
- `db:reset && db:seed` verde
- Tests T-FISC-001-1..4 verde (blocante)

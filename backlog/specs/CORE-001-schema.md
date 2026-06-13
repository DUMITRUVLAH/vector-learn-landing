---
id: CORE-001
title: "FinDesk schema finCore.ts (org profile, invoice series, members, onboarding) + migrare 0116 + index export + seed firmă demo"
milestone: FIN
phase: "1"
status: pending
attempts: 0
depends_on: []
spec: backlog/specs/CORE-001-schema.md
core: backlog/fin/FIN-CORE.md
---

## Goal

Fundația modulului FinDesk: modelul de date pentru workspace-ul de firmă, reutilizând stack-ul
existent (Drizzle + PGlite/Supabase, multi-tenant). Un fișier `server/db/schema/finCore.ts` cu
tabelele din FIN-CORE §1.1, enum-urile, migrare committed cu prefix `0116`, export în `schema/index.ts`
și seed pentru o firmă demo cu utilizatori pe fiecare rol. Toate item-urile FinDesk se construiesc peste.

## User stories

- **Ca** dezvoltator, **vreau** un model de date pentru profilul fiscal + seria de facturare + membri, **pentru că** restul FinDesk se construiește peste el fără rework.
- **Ca** owner de firmă, **vreau** ca datele firmei mele să fie izolate pe tenant, **pentru că** datele financiare nu trebuie să se vadă între firme.
- **Ca** dezvoltator, **vreau** un seed cu owner/contabil/cfo/viewer, **pentru că** pot testa imediat rolurile.

## Acceptance criteria

- [ ] `server/db/schema/finCore.ts` definește: `fin_org_profile`, `fin_invoice_series`, `fin_members`, `fin_onboarding` (FIN-CORE §1.1)
- [ ] Enum-uri: `fin_country` (MD|RO), `fin_vat_regime` (payer|non_payer), `fin_role` (owner|accountant|cfo|viewer), `fin_doc_type` (invoice|proforma|receipt), `fin_onboarding_step` (company|parties|first_invoice|done)
- [ ] Toate tabelele: `id uuid pk default gen_random_uuid()`, `tenant_id → tenants(id) on delete cascade`, `created_at`, `updated_at`
- [ ] `fin_org_profile`: 1 rând/tenant, `base_currency default 'MDL'`, `fiscal_year_start int default 1`
- [ ] `fin_invoice_series`: `prefix`, `next_number int default 1`, `pad_width int default 4`, `doc_type`, `is_default bool`
- [ ] `fin_members`: `user_id → users`, `role`, `permissions jsonb`
- [ ] Index pe `tenant_id` + pe `user_id` (fin_members)
- [ ] `server/db/schema/index.ts` conține `export * from "./finCore";` (același commit — §3.5.1)
- [ ] `drizzle/0116_fin_core.sql` committed; `db:generate` lasă 0 fișiere uncommitted; prefix `0116` > `0115`
- [ ] `--> statement-breakpoint` între statement-uri (§3.5.1)
- [ ] Seed (`server/db/seed.ts` extins, idempotent, guarded): tenant demo „Studio Vega SRL", 4 useri (owner/accountant/cfo/viewer), `fin_org_profile` (MD, payer, MDL), 1 serie default `VEGA-2026-`
- [ ] `db:reset && db:seed` trec fără eroare
- [ ] Tenant-isolation: toate query-urile filtrează pe `tenant_id` (regula #6)

## Files

**New:**
- `server/db/schema/finCore.ts`
- `drizzle/0116_fin_core.sql` (+ `drizzle/meta/0116_snapshot.json`, `_journal.json` entry idx 116)

**Modified:**
- `server/db/schema/index.ts` — `export * from "./finCore";`
- `server/db/seed.ts` — seed FinDesk demo (idempotent, guarded)

## Tests

- **T-CORE-001-1** [blocant] `npm run db:generate` → 0 fișiere uncommitted, prefix `0116`
- **T-CORE-001-2** [blocant] `db:reset && db:seed` → trec; există tenant demo + 4 useri pe roluri + org profile + serie
- **T-CORE-001-3** [blocant] `schema/index.ts` conține `export * from "./finCore"` (altfel `db.query.fin*` undefined → 500)
- **T-CORE-001-4** [blocant] `src/__tests__/schema-drift.test.ts` rămâne verde
- **T-CORE-001-5** [normal] Seed idempotent: rulat de 2× nu duplică

## DoD

- Migration gate verde (0 uncommitted; db:reset+seed OK; prefix>0115; breakpoints OK)
- schema-drift + check-refs verzi
- Reviewer APPROVED; integration-architect `CONNECTED` (reutilizează tenants/users)
- Persona reports salvate

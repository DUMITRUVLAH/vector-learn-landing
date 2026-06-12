---
id: PAR-001
title: "PAR schema (par.ts) + enums + migration 0113 + index export + seed demo NGO"
milestone: PAR
phase: "A"
status: pending
attempts: 0
depends_on: []
spec: backlog/specs/PAR-001-schema.md
core: backlog/par/PAR-CORE.md
---

## Goal

Creează modelul de date complet pentru modulul Payment Action Request, reutilizând stack-ul existent
(Drizzle + PGlite/Supabase, multi-tenant). Un singur fișier `server/db/schema/par.ts` cu toate
tabelele din PAR-CORE §2, enum-urile, o migrare committed cu prefix `0113`, export în `schema/index.ts`
și seed pentru un tenant demo NGO cu utilizatori pe fiecare rol. Aceasta e fundația tuturor item-urilor PAR.

## User stories

- **Ca** dezvoltator, **vreau** un model de date care acoperă fidel cele 16 secțiuni ale formularului PAR, **pentru că** restul modulului se construiește peste el fără rework.
- **Ca** admin NGO, **vreau** ca fiecare înregistrare să fie izolată pe tenant, **pentru că** datele financiare nu trebuie să se vadă între organizații.
- **Ca** dezvoltator, **vreau** un seed care creează un requestor, un approver, un finance și un admin, **pentru că** pot testa imediat tot fluxul.

## Acceptance criteria

- [ ] `server/db/schema/par.ts` definește: `parRequests`, `parLineItems`, `parApprovals`, `parAttachments`, `parPayments`, `parDoaMatrix`, `parBudgetCodes`, `parDepartments`, `parProjects`, `parVendors`, `parSettings`, `parAudit` (CORE §2)
- [ ] Enum-uri: `par_purpose` (execute_payment|obtain_quotations|provide_estimate), `par_charge_to` (operations|program|other), `par_status` (draft|pending_approval|changes_requested|rejected|approved|in_finance|reapproval_required|paid|cancelled), `par_decision` (pending|approved|rejected|changes_requested), `par_role` (requestor|approver|finance|par_admin), `par_attachment_kind` (act_of_receipt|contract|quotation|invoice|par_pdf|other)
- [ ] Toate tabelele au `id uuid pk`, `tenantId → tenants` (cascade), `createdAt`, `updatedAt`; bani în `*_cents` integer + `currency` default `MDL`
- [ ] `par_members` (mapping user→par_role + `approval_limit_cents` nullable) — vezi și PAR-002, dar tabelul se declară aici
- [ ] Index-uri pe `tenant_id` + pe FK-urile interogate des (`par_id`, `status`)
- [ ] `server/db/schema/index.ts` conține `export * from "./par";` (același commit — §3.5.1)
- [ ] `drizzle/0113_par_core.sql` committed; `db:generate` lasă 0 fișiere uncommitted; prefix `0113` > `0112`
- [ ] `--> statement-breakpoint` între statement-uri în migrarea hand-written (§3.5.1)
- [ ] Seed (`server/db/seed.ts` extins, idempotent): tenant demo „ATIC — Digital Safeguard", 4 useri (requestor/approver/finance/admin), `par_settings` cu `micro_purchase_threshold_cents` și `default_currency="MDL"`, 1 project „Digital Safeguard", câteva budget codes + departments
- [ ] `db:reset && db:seed` trec fără eroare

## Files

**New:**
- `server/db/schema/par.ts`
- `drizzle/0113_par_core.sql` (+ `drizzle/meta/0113_snapshot.json`, `_journal.json` entry idx 113)

**Modified:**
- `server/db/schema/index.ts` — `export * from "./par";`
- `server/db/seed.ts` — seed PAR demo (idempotent, guarded)

## Tests

- **T-PAR-001-1** [blocant] Given schema `par.ts`, When `npm run db:generate`, Then 0 fișiere uncommitted, prefix `0113`
- **T-PAR-001-2** [blocant] Given migrarea committed, When `db:reset && db:seed`, Then trec; există tenant demo + 4 useri pe roluri
- **T-PAR-001-3** [blocant] Given `schema/index.ts`, Then conține `export * from "./par"` (altfel `db.query.parRequests` undefined → 500)
- **T-PAR-001-4** [normal] Given seed, Then ≥1 `par_settings` cu threshold + `currency="MDL"`
- **T-PAR-001-5** [blocant] `src/__tests__/schema-drift.test.ts` rămâne verde (schema ↔ migrare în sync)

## DoD

- Migration gate verde (0 uncommitted; db:reset+seed OK; prefix>0112; breakpoints OK)
- schema-drift + check-refs verzi
- Reviewer APPROVED; integration-architect fără COMPETING_SYSTEM (reutilizează tenants/users)
- Persona reports salvate

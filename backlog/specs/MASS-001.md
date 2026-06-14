---
id: MASS-001
title: "Schema fin_bulk_jobs + fin_bulk_rows + migrare 0115 + runner async"
milestone: FIN
phase: "15"
status: pending
depends_on: [CALENDAR-001]
spec: backlog/specs/MASS-001.md
branch: feat/FIN-mass
---

## Goal

Creează infrastructura de date și runner-ul async pentru operațiunile bulk din FinDesk
(FIN-CORE §1.15). Principiu: orice operație care procesează N înregistrări (N ≥ 10) rulează
asincron ca un „job" cu raport per rând și posibilitate de retry.

1. **`fin_bulk_jobs`** — job-ul principal (tip, status, tenant, metadata, count total/success/fail,
   creat de cine, durata, erori globale).
2. **`fin_bulk_rows`** — fiecare rând procesat în cadrul job-ului (referință externă, status
   per-rând, mesaj eroare, retry count).
3. **Migrare `0115_fin_bulk.sql`** cu statement-breakpoints corecte (> max 0114 pe main).
4. **Runner async** (`server/lib/finBulkRunner.ts`) — funcție `runBulkJob(jobId, processor)` care
   iterează rândurile, cheamă procesorul, marchează status per rând, actualizează job-ul la final.
   Re-try automat pentru rândurile eșuate (max 3 încercări).
5. Seed: 1 job demo finalizat cu 3 rânduri (2 success, 1 fail) pentru tenant test.

Calculele sunt DETERMINISTE. Banii în cenți (FIN-CORE regula #10). Tenant isolation obligatorie.

---

## User stories

- Ca **contabil**, vreau să văd statusul unui job bulk în timp real (pending/running/done/failed),
  pentru că știu când pot continua lucrul cu rezultatele.
- Ca **director financiar**, vreau să văd un raport per rând din fiecare job bulk (success/fail + mesaj),
  pentru că pot re-procesa manual rândurile eșuate.
- Ca **sistem**, vreau ca job-urile bulk să re-încerce automat rândurile eșuate (max 3x),
  pentru că erorile tranzitorii nu trebuie să blocheze întregul batch.
- Ca **administrator**, vreau ca schema să fie multi-tenant și izolată, pentru că datele unui
  client nu trebuie să fie vizibile altuia.

---

## Acceptance criteria

- [ ] AC1: Tabelul `fin_bulk_jobs` creat cu coloanele:
  `id UUID PK DEFAULT gen_random_uuid()`,
  `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`,
  `job_type VARCHAR(50) NOT NULL` (valori: `recurring_invoices|csv_import_parties|csv_import_spend`),
  `status VARCHAR(20) NOT NULL DEFAULT 'pending'` (pending|running|done|failed|cancelled),
  `total_rows INTEGER NOT NULL DEFAULT 0`,
  `success_rows INTEGER NOT NULL DEFAULT 0`,
  `fail_rows INTEGER NOT NULL DEFAULT 0`,
  `created_by UUID REFERENCES users(id) ON DELETE SET NULL`,
  `started_at TIMESTAMPTZ nullable`,
  `finished_at TIMESTAMPTZ nullable`,
  `error_message TEXT nullable`,
  `meta JSONB NOT NULL DEFAULT '{}'` (parametri specifici tipului de job),
  `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
  `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
  Index: `fbj_tenant_idx (tenant_id)`, `fbj_tenant_status_idx (tenant_id, status)`,
  `fbj_tenant_type_idx (tenant_id, job_type)`.

- [ ] AC2: Tabelul `fin_bulk_rows` creat cu coloanele:
  `id UUID PK DEFAULT gen_random_uuid()`,
  `job_id UUID NOT NULL REFERENCES fin_bulk_jobs(id) ON DELETE CASCADE`,
  `row_index INTEGER NOT NULL` (0-based),
  `external_ref VARCHAR(200) nullable` (ID extern: agreement_id, CSV line nr etc.),
  `status VARCHAR(20) NOT NULL DEFAULT 'pending'` (pending|success|fail|skipped),
  `retry_count INTEGER NOT NULL DEFAULT 0`,
  `error_message TEXT nullable`,
  `result_ref VARCHAR(200) nullable` (ID-ul obiectului creat: invoice_id etc.),
  `processed_at TIMESTAMPTZ nullable`,
  `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
  Index: `fbr_job_idx (job_id)`, `fbr_job_status_idx (job_id, status)`.
  Constraint UNIQUE: `(job_id, row_index)`.

- [ ] AC3: Migrare `drizzle/0115_fin_bulk.sql` cu statement-breakpoints corecte (§3.5.1).
  Nu conține enum-uri Postgres native (VARCHAR + validare cod) pentru portabilitate PGlite.
  `npm run db:reset && npm run db:seed` trece cu migrarea inclusă.

- [ ] AC4: `server/db/schema/finBulk.ts` exportat în `server/db/schema/index.ts`:
  `export * from "./finBulk";` adăugat la finalul fișierului.

- [ ] AC5: Drizzle relations declarate:
  `finBulkJobs → tenants (many-to-one)`,
  `finBulkJobs → users (many-to-one, created_by)`,
  `finBulkRows → finBulkJobs (many-to-one)`.

- [ ] AC6: Runner async `server/lib/finBulkRunner.ts`:
  - Export: `runBulkJob(db, jobId: string, processor: (row: FinBulkRow) => Promise<{ref?: string, error?: string}>): Promise<void>`
  - Marchează job `status='running'`, `started_at=now()`
  - Iterează rândurile cu `status='pending'` în ordine `row_index`
  - Cheamă `processor(row)`:
    - Success → marchează rândul `status='success'`, `result_ref=ref`, `processed_at=now()`
    - Fail → incrementează `retry_count`; dacă `retry_count < 3` → lasă `pending`; altfel → `status='fail'`, `error_message=error`
  - La final actualizează `success_rows`, `fail_rows`, `status='done'` (sau `'failed'` dacă toate rândurile au eșuat)
  - `finished_at=now()`

- [ ] AC7: Seed în `server/db/seed.ts`:
  - Job demo: `{ job_type: 'recurring_invoices', status: 'done', total_rows: 3, success_rows: 2, fail_rows: 1 }`
  - Rând 0: `{ external_ref: 'agr-demo-1', status: 'success', result_ref: 'inv-demo-1' }`
  - Rând 1: `{ external_ref: 'agr-demo-2', status: 'success', result_ref: 'inv-demo-2' }`
  - Rând 2: `{ external_ref: 'agr-demo-3', status: 'fail', error_message: 'Client inactiv', retry_count: 3 }`

- [ ] AC8: TypeScript types exportate: `FinBulkJob`, `InsertFinBulkJob`, `FinBulkRow`, `InsertFinBulkRow`.

- [ ] AC9: Zero `any`. Tenant isolation — toate query-urile filtrează după `tenant_id` (sau `job_id` cu join la `tenant_id`).

---

## Files to create / modify

**Create:**
- `server/db/schema/finBulk.ts` — schema Drizzle fin_bulk_jobs + fin_bulk_rows + types + relations
- `drizzle/0115_fin_bulk.sql` — migrare manuală hand-written cu statement-breakpoints
- `drizzle/meta/0115_snapshot.json` — snapshot minimal
- `server/lib/finBulkRunner.ts` — runner async cu retry logic
- `src/__tests__/fin/fin-bulk-schema.test.ts` — test existență migrare + schema + exports + runner

**Modify:**
- `server/db/schema/index.ts` — adaugă `export * from "./finBulk";`
- `drizzle/meta/_journal.json` — adaugă entry `{ idx: 115, version: "7", when: <ts>, tag: "0115_fin_bulk" }`
- `server/db/seed.ts` — adaugă seed fin_bulk_jobs + fin_bulk_rows

---

## Tests

- **T-MASS-001-1** `[blocant]` Migration discipline: `drizzle/0115_fin_bulk.sql` există și conține `CREATE TABLE "fin_bulk_jobs"` și `CREATE TABLE "fin_bulk_rows"`.
- **T-MASS-001-2** `[blocant]` `_journal.json` conține entry cu idx=115 și tag care include "fin_bulk".
- **T-MASS-001-3** `[blocant]` Schema: `finBulkJobs` și `finBulkRows` exportate din `server/db/schema/index.ts` (nu undefined).
- **T-MASS-001-4** `[blocant]` Runner: `runBulkJob` exportat din `server/lib/finBulkRunner.ts`; dat un processor care returnează success pentru rândul 0 și fail pentru rândul 1 (retry_count=0), rândul 1 rămâne `pending` după prima rulare.
- **T-MASS-001-5** [normal] `finBulkJobs` are coloanele: id, tenant_id, job_type, status, total_rows, success_rows, fail_rows, meta.
- **T-MASS-001-6** [normal] `finBulkRows` are coloanele: id, job_id, row_index, external_ref, status, retry_count, error_message, result_ref.
- **T-MASS-001-7** [normal] Runner marchează job `status='done'` când toate rândurile sunt procesate (success sau fail definitiv).

---

## Definition of Done

- [ ] AC1–AC9 implementate
- [ ] T-MASS-001-1..4 trec (blocante)
- [ ] Build + typecheck + lint verzi
- [ ] server/db/schema/index.ts include export finBulk
- [ ] _journal.json are idx 115 fără duplicate pe acest branch

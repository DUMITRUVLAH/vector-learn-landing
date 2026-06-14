---
id: SPEND-001
title: "Schema fin_expenses + fin_expense_attachments + migrare 0119"
milestone: FIN
phase: spend
branch: feat/FIN-spend
depends_on: []
spec: backlog/specs/SPEND-001-schema.md
status: pending
attempts: 0
blockers: []
---

## Goal

Definește schema DB pentru modulul Cheltuieli (Spend) al FinDesk.
Sursa de adevăr: FIN-CORE §1.7 „Cheltuieli".

**Tabele noi:**

### `fin_expenses`
- `id` UUID PK
- `tenant_id` UUID FK → tenants.id
- `category` enum `fin_expense_category`: `rent | utilities | salaries | marketing | supplies | software | maintenance | other`
- `amount_cents` integer NOT NULL (valoarea în cenți)
- `currency` varchar(3) default 'MDL'
- `vat_deductible` boolean NOT NULL (TVA deductibil — regula #1 din FIN-CORE)
- `vat_amount_cents` integer (TVA calculat, poate fi 0)
- `source` enum `fin_expense_source`: `manual | capture | payroll | asset`
- `status` enum `fin_expense_status`: `draft | approved | rejected | paid`
- `description` text
- `reference` varchar(100) (ex. nr. document, bon, etc.)
- `vendor_name` varchar(200)
- `expense_date` date NOT NULL
- `paid_at` timestamp (când a fost plătită efectiv)
- `approved_by` UUID FK → users.id nullable
- `approved_at` timestamp nullable
- `created_by` UUID FK → users.id
- `created_at` / `updated_at` timestamps

### `fin_expense_attachments`
- `id` UUID PK
- `tenant_id` UUID FK → tenants.id
- `expense_id` UUID FK → fin_expenses.id ON DELETE CASCADE
- `file_key` varchar(500) (S3/storage path)
- `file_name` varchar(255)
- `mime_type` varchar(100)
- `size_bytes` integer
- `uploaded_at` timestamp NOT NULL defaultNow()

**Migrare:** `drizzle/0119_fin_expenses.sql`

**Seed:** adaugă 2-3 cheltuieli demo per tenant de seed în `server/db/seed.ts`.

## User stories

- Ca director de academie, vreau să înregistrez cheltuielile lunare pe categorii, pentru că am nevoie de o evidență clară a costurilor.
- Ca director, vreau să știu ce TVA este deductibil, pentru că reduc povara fiscală a academiei.
- Ca contabil, vreau să văd sursa cheltuielii (manuală, stat de plată, activ), pentru că fiecare tip are tratament contabil diferit.
- Ca director, vreau să atașez bon/factură la o cheltuială, pentru că documentele primare sunt obligatorii legal.

## Acceptance criteria

- [ ] Migrarea 0119 creează tabelele `fin_expenses` și `fin_expense_attachments`
- [ ] Enum-urile `fin_expense_category`, `fin_expense_source`, `fin_expense_status` sunt definite
- [ ] Schema Drizzle (`server/db/schema/finExpenses.ts`) exportă toate tipurile
- [ ] `server/db/schema/index.ts` are `export * from "./finExpenses"` adăugat
- [ ] `npm run db:reset && npm run db:seed` trece fără erori
- [ ] Seed-ul inserează cel puțin 2 cheltuieli demo
- [ ] TypeScript strict: zero `any`, toate câmpurile au tipuri
- [ ] Migration statement-breakpoint prezent dacă sunt mai multe SQL statements

## Files

### New
- `server/db/schema/finExpenses.ts` — schema Drizzle
- `drizzle/0119_fin_expenses.sql` — migrare SQL

### Modified
- `server/db/schema/index.ts` — adaugă `export * from "./finExpenses"`
- `server/db/seed.ts` — seed cheltuieli demo

## Tests

- **T-SPEND-001-1** [blocant] Given npm run db:reset && npm run db:seed, When se rulează, Then succeeds without error
- **T-SPEND-001-2** [blocant] Given schema finExpenses.ts, When db.select().from(finExpenses), Then returnează array (portability check: nu raw .execute().rows)
- **T-SPEND-001-3** [blocant] Given drizzle/0119_fin_expenses.sql, When se verifică _journal.json, Then prefix 0119 este unic și idx nu colizionează cu main
- **T-SPEND-001-4** [normal] Given schema, When se inserează o cheltuială cu vat_deductible=true, Then se poate regăsi cu câmpul corect
- **T-SPEND-001-5** [normal] Given schema, When se încearcă insert fără expense_date, Then constraint NOT NULL eșuează corect
- **T-SPEND-001-6** [normal] Given finExpenses în index.ts, When import din server/db/schema, Then nu aruncă undefined la db.query.finExpenses

## DoD

- Migrarea 0119 unică, prefix liber pe main (verificat)
- db:reset + db:seed verzi
- Schema exportată corect în index.ts
- statement-breakpoints prezente dacă >1 SQL statement

# Migration ↔ schema COLUMN TYPE drift (fin_invoices.number)

**Symptom:** `COALESCE types text and integer cannot be matched` → 500 on every fresh DB
(PGlite tests, new deploys) for any route using `COALESCE(MAX(number), 0)::int`, while prod
works fine.

**Root cause (one sentence):** migration `0126` created `fin_invoices.number` as
`varchar(50)` while the Drizzle schema (and prod Supabase, where the table pre-existed and
the `CREATE IF NOT EXISTS` no-op'd) declare `integer` — so fresh environments get a
different COLUMN TYPE than prod, and the numbering query only crashes there.

**Why no gate caught it:** `schema-drift.test.ts` checks table/column EXISTENCE, not types.
Unit tests were "pure" copies that never executed the route against a migrated DB.

**Fix:** guarded type-conversion migration `0131_fin_invoices_number_type.sql` (converts
only when the column is still character; no-op on prod). Regression net: the STMT-005
integration tests (`server/__tests__/statementEfactura.routes.test.ts`) boot PGlite with ALL
migrations and exercise the real route — any future type drift on this path fails there.

**Rule to carry forward:** when a migration `CREATE TABLE IF NOT EXISTS` is written for a
table that ALREADY exists in prod (bootstrap style), copy the column types from the Drizzle
schema VERBATIM — a hand-typed approximation ships a divergent universe to every fresh DB.
Route-level tests must run against a DB built from the committed migrations (not from the
ORM schema) precisely to catch this class.

---
title: Competing migrations both CREATE TABLE same name — second silently skipped
problem_type: migration-collision
module: fin_ledger_entries, schema-drift
tags: [migrations, CREATE TABLE IF NOT EXISTS, schema-drift, pglite, demo-branch]
symptoms: schema-drift test fails reporting "Columns in code but missing from migrations" even though a later migration clearly creates those columns
severity: high
date: 2026-06-14
---

## Symptom
`schema-drift.test.ts` reports `fin_ledger_entries.entry_date`, `.debit_cents`, etc. as "columns in code but missing from migrations" — even though migration 0143 explicitly creates the table with those columns.

## Root cause
Two migrations both contain `CREATE TABLE IF NOT EXISTS "fin_ledger_entries"`:
- **0128** (MULTICURRENCY-002): created the table with a narrow FX-revaluation schema (columns: `currency_from`, `currency_to`, `amount_cents`, `rate_used`, …)
- **0143** (LEDGER rebuild): tried to create the table with the current production schema (columns: `entry_date`, `account_code`, `debit_cents`, `credit_cents`, …)

Because 0128 runs first and 0143 uses `IF NOT EXISTS`, 0143 is silently a no-op. The table stays in the 0128 shape. The code (`finLedger.ts`) was updated to reference 0143 columns but the DB still has 0128 columns → schema-drift → 500s at runtime.

## Fix
Write an `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration for each missing column:
```sql
-- migration 0145_fix_fin_ledger_entries.sql
ALTER TABLE "fin_ledger_entries" ADD COLUMN IF NOT EXISTS "entry_date" date;
--> statement-breakpoint
ALTER TABLE "fin_ledger_entries" ADD COLUMN IF NOT EXISTS "account_code" varchar(20);
-- etc.
```
This is safe: `IF NOT EXISTS` is a no-op if the column already exists (e.g. if the DB was created fresh from 0143 without the 0128 schema).

## How to avoid next time
- **Never use `CREATE TABLE IF NOT EXISTS` if the table may already exist with a different shape.** If you're rebuilding a table schema, either:
  1. Use `DROP TABLE IF EXISTS` + `CREATE` (only in dev/seed, never on prod with live data), or
  2. Use `ALTER TABLE ADD COLUMN IF NOT EXISTS` + `DROP COLUMN IF EXISTS` for the diff.
- When schema-drift reports "columns missing" but you CAN see them in a later migration, suspect a competing earlier migration that created the table first.
- Run `grep -r "CREATE TABLE.*<table_name>" drizzle/*.sql` to detect duplicate table creation before merging.

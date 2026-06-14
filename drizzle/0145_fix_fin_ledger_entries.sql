-- SPLIT-003 (fix): fin_ledger_entries column reconciliation
-- Migration 0128 created fin_ledger_entries with the old FX-revaluation column set.
-- Migration 0143 tried to CREATE TABLE IF NOT EXISTS (silently skipped — already existed).
-- Result: prod DB has 0128 columns; code (finLedger.ts) expects 0143 columns.
-- This migration adds the missing columns with safe defaults so existing rows are preserved.
ALTER TABLE "fin_ledger_entries" ADD COLUMN IF NOT EXISTS "entry_date" date;
--> statement-breakpoint
ALTER TABLE "fin_ledger_entries" ADD COLUMN IF NOT EXISTS "account_code" varchar(20);
--> statement-breakpoint
ALTER TABLE "fin_ledger_entries" ADD COLUMN IF NOT EXISTS "debit_cents" bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "fin_ledger_entries" ADD COLUMN IF NOT EXISTS "credit_cents" bigint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "fin_ledger_entries" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "fin_ledger_entries" ADD COLUMN IF NOT EXISTS "ref" varchar(100);
--> statement-breakpoint
ALTER TABLE "fin_ledger_entries" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone NOT NULL DEFAULT now();

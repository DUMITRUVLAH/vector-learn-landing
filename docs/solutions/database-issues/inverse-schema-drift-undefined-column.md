---
title: Migration added a column but the schema file never declared it → route 500s "Cannot convert undefined or null to object"
problem_type: database_issue
module: migrations
tags: [drizzle, schema, drift, undefined-column, tenants, select, 500, inverse-drift]
symptoms: A route 500s with "Cannot convert undefined or null to object" inside a db.select()
severity: P1
date: 2026-06-02
---

## Symptom
A route 500s with `Cannot convert undefined or null to object`. The handler does `db.select({ x: tenants.invoicePrefix, ... })` and looks correct. (Hit on `/api/tenantSettings`, `/api/settings/ai`, `/api/settings/branding`.)

## Root cause
The **inverse** of normal schema drift: a migration (0047/0055/0108) `ADD COLUMN`-ed `invoice_prefix`, `iban`, `bic`, `ai_monthly_budget_usd_cents`, `logo_url`, `branding_json` to `tenants`, but `server/db/schema/tenants.ts` never declared those columns. So `tenants.invoicePrefix` evaluates to `undefined` at runtime, and Drizzle's field-selection builder throws when it iterates an `undefined` column. `schema-drift.test.ts` does NOT catch this — it checks code→migration (column declared in code exists in DB), not migration→code.

## Fix
Declare the missing columns in the schema file to match what the migrations created (same name/type). No new migration needed — the columns already exist in the DB.

## How to avoid next time
- TypeScript would flag `tenants.invoicePrefix` as nonexistent, but `vite build`/esbuild/tsx don't type-check. The undefined-ref build gate only covers TS2304/2552, not member access on a typed object.
- When you write a migration that adds a column, add the matching field to the schema file in the **same commit** (mirror of the schema-index rule in CLAUDE.md §3.5.1).
- A future bidirectional drift gate (DB columns must also be declared in code) would catch this class.

---
title: Hand-written migration with multiple statements and no "--> statement-breakpoint" → db:reset dies on PGlite
problem_type: database_issue
module: migrations
tags: [drizzle, migration, statement-breakpoint, pglite, db:reset, 42601, multiple-commands, prepared-statement]
symptoms: "cannot insert multiple commands into a prepared statement" (PG 42601) running db:reset / db:migrate locally
severity: P0
date: 2026-06-02
---

## Symptom
`npm run db:reset` (or any fresh PGlite/test DB) dies with `cannot insert multiple commands into a prepared statement` (Postgres error 42601). 23 migrations were affected; local dev, the test suite, and the migration gate were all broken.

## Root cause
The Drizzle migrator splits each `.sql` on `--> statement-breakpoint` and sends each chunk as ONE prepared statement. A hand-written migration that packs several DDL statements into one file with no breakpoints becomes a single multi-command string → PGlite and the Postgres extended protocol reject it. Prod (postgres-js) happened to tolerate the multi-command string, so this only ever broke local/PGlite/CI and went unnoticed. (`drizzle-kit generate` is broken on this repo — see [[db-generate-broken-handwrite-migrations]] — so migrations are hand-written and this recurs.)

## Fix
Insert `--> statement-breakpoint` between every top-level statement. The split must be **dollar-quote-aware**: a `;` inside a `DO $$ … $$;` block is NOT a statement boundary.

## How to avoid next time
- **`scripts/check-migration-breakpoints.mjs`** (build + `prod-safety.yml` CI): fails if any between-breakpoint chunk contains more than one top-level statement (dollar-quote-aware).
- When hand-writing a migration, always separate statements with `--> statement-breakpoint` and run `npm run db:reset` before committing.

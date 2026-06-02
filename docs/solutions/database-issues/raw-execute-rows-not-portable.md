---
title: db.execute(...).rows breaks on PGlite vs Postgres (result shape differs)
problem_type: database_issue
module: db-portability
tags: [drizzle, pglite, postgres, supabase, execute, rows, portability, health]
symptoms: A route works in local tests (PGlite) but 500s in prod (Postgres), or vice versa
severity: P1
date: 2026-05-30
---

## Symptom
`/api/health/db` and other routes using raw `db.execute(...).rows` broke because the result
shape differs between PGlite (local/tests) and Postgres (Supabase prod).

## Root cause
Raw `db.execute()` returns `{ rows: [...] }` on one driver and a bare array on the other.
Code that hard-codes `.rows` works on one and throws on the other.

## Fix
Never use raw `db.execute(...).rows`. Prefer the query builder. If raw is unavoidable, handle
both: `Array.isArray(r) ? r : r.rows`.

## How to avoid next time
- `test-runner`'s DB-portability gate flags raw `.execute().rows`.
- Default to the Drizzle query builder; it abstracts the driver difference.

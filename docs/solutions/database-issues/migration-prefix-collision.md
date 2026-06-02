---
title: Parallel branches mint the same migration prefix → every DB route 500s
problem_type: database_issue
module: migrations
tags: [drizzle, migration, prefix, collision, journal, 0016, db:generate, supabase]
symptoms: After merging two feature branches, every DB-backed route returns 500 in prod
severity: P0
date: 2026-06-01
---

## Symptom
Two branches each added a `0016_*.sql` migration. After both merged, migration tracking
desynced and every DB route 500'd in prod.

## Root cause
Drizzle numbers migrations from the branch point, so parallel branches all independently
mint the same next prefix (`0016_`). Merging both produces a duplicate `idx` in
`meta/_journal.json` and a broken migration order.

## Fix
Every migration prefix a branch adds must be **> the max prefix on `origin/main`**. If not,
renumber: rename the `.sql` + `meta/<idx>_snapshot.json`, fix `idx`+`tag` in
`meta/_journal.json`. `_journal.json` must never have a duplicate `idx`.
`test-runner` gate 4a-bis enforces this.

## How to avoid next time
- Branch off fresh `origin/main`, rebase before push.
- Check prefixes vs main before merging any PR with a migration.
- `db:generate` may be broken on meta collisions → hand-write `.sql` + append `_journal.json`,
  validate on a throwaway PGlite first.

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

## Update 2026-09-26 — the manual rule was not enough; now it is scripted
With many agents launched at once, "check prefixes vs main" still lost the race: 0191 and then
0192 were each minted by two agents within one hour (the check passes on both branches, because
neither is on main yet). A second, quieter bug rode along: renumbering fixed the prefix but left
`when` = "last + 1", equal to the other branch's — and drizzle applies a migration only if its
`when` > the last applied `created_at`, so the second one is **skipped silently** on any DB that
already ran the first (15 historical entries on main have this; sync-schema covers them).

Now:
- `npm run migration:new -- <slug>` reserves the number **atomically on GitHub**
  (`refs/migration-reservations/NNNN`). The pushed object must be a UNIQUE token, not `HEAD`:
  two agents fresh from origin/main share HEAD, and the second push of the same SHA reports
  "up to date" *before* the lease check — both "won" 9990 in the live test.
- `npm run ship` rebases, unions `_journal.json` conflicts, renumbers own migrations above main
  with increasing `when`, runs the guards, pushes `HEAD:main` without force, retries on a race,
  and stops (branch intact) on any real code conflict.
- `scripts/check-migration-journal.mjs` (build + CI): duplicate idx/tag/prefix, missing `.sql`.
- Tests: `scripts/__tests__/parallel-migrations.test.mjs` (bare repo + racing clones, incl. the
  same-SHA race) and `scripts/__tests__/migrationPlan.test.mjs`.
- Agent: `.claude/agents/parallel-dev.md` knows the whole flow (worktree → migration:new → ship).

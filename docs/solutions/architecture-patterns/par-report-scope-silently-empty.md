---
title: Scoped PAR reports silently returned zeros because payer-level requests were filtered out
problem_type: architecture_pattern
module: par
tags: [par, reports, scope, multi-payer, project-membership, silent-wrong-number, list-vs-report]
symptoms: GET /api/par/reports/* returned {"items":[]} (or under-counted) for an approver/finance user while the admin saw the real figures
severity: P1
date: 2026-08-25
---

## Symptom
An approver or finance officer opened a spend report and saw **zeros**, while a workspace admin saw the
real totals for the same tenant. No error, no empty-state explanation — just a wrong number.

## Root cause
The multi-payer scoping middleware in `server/routes/parReports.ts` narrowed every report to
`project_id IN (the user's projects)`. A PAR created without a project — the normal payer-level
request — has `project_id = NULL`, so it matched nothing and disappeared from every report for every
scoped user.

The **list** endpoint (`GET /api/par`) had already solved this correctly:
`project IN (…) OR (project IS NULL AND payer IN (…))`. The report grew its own copy of the scoping
logic and the copy was incomplete — the same duplicated-rule failure as the draft-visibility leak.

## Fix
The report scope now mirrors the list: the user's projects **plus** the payer-level requests of the
payers they belong to (`accessiblePayerIds`, intersected with the PAR-entitled payers).

## How to avoid next time
When two endpoints answer "which rows may this user see?", they must share the predicate or be tested
against each other. The regression that catches it asserts an *equality between roles* rather than a
status code: "an approver's own reports are not silently empty" and "finance sees the same spend
totals as the admin" (`scripts/e2e-par-blind-150.mjs`). A wrong number in a finance report is worse
than an error, because nobody goes looking for it.

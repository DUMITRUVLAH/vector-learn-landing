---
id: INTEG-103
title: "Integrare: cohorts.branchId — cohortă legată de filială"
milestone: INTEG
phase: 1
status: in_progress
depends_on: [INTEG-101, INTEG-102]
slug: cohorts-branch-fk
---

## Goal

Adaugă `branch_id` (UUID, soft-ref, nullable) pe tabela `cohorts` pentru a lega o ediție de curs
de o filială specifică. Permite filtrarea cohortelor per filială și rapoarte de cohortă per filială.

Notă: FK hard constraint (REFERENCES branches(id)) se adaugă post-merge al PR BRANCH-faza-1 (#110).
Acum: câmp UUID soft (fără FK), la fel ca leads.branchId (INTEG-101 pattern).

## In scope

- Migration: ADD COLUMN branch_id uuid (nullable, fără FK constraint acum).
- Schema Drizzle: cohorts.branchId (uuid, nullable).
- Route PATCH /api/cohorts/:id acceptă branchId.
- Route GET /api/cohorts acceptă query param `branchId` (filter).
- Tests: T-INTEG-103-1..4 verzi.

## Out of scope

- FK hard constraint → post-merge BRANCH-faza-1.
- Branch selector în UI cohortă (UI item separat).

## User stories

- **US-1**: Ca manager, vreau să asociez o ediție de curs cu o filială pentru rapoarte per filială.
- **US-2**: Ca manager, vreau să filtrez cohortele după filială.

## Acceptance criteria

- [ ] AC1: Migration adaugă branch_id uuid nullable pe cohorts.
- [ ] AC2: PATCH /api/cohorts/:id cu branchId → salvat corect.
- [ ] AC3: GET /api/cohorts?branchId=X → returnează doar cohortele acelei filiale.
- [ ] AC4: GET /api/cohorts fără filter → returnează toate cohortele (backward compatible).
- [ ] AC5: tenant-safe; zero `any`; fără raw `.execute().rows`.

## Tests

- **T-INTEG-103-1** `[blocant]` Schema cohorts.branchId există și e nullable.
- **T-INTEG-103-2** `[blocant]` PATCH cu branchId valid → branchId setat pe cohortă.
- **T-INTEG-103-3** `[blocant]` GET ?branchId= → filtrare corectă (returnează numai cohorte cu acel branchId).
- **T-INTEG-103-4** GET fără filter → toate cohortele (backward compatible).

## Definition of Done

- [ ] AC1-5 bifate; T-INTEG-103-1..4 verzi; build+typecheck+lint+test verzi
- [ ] Migration + portability verzi (§3.5.1)

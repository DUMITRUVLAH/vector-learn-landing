---
id: INTEG-103
title: cohorts.branchId FK + branch filter — cohorte per filială
milestone: INTEG
phase: "1"
branch: feat/INTEG-faza-1-conectivitate-module
status: pending
attempts: 0
depends_on: [BRANCH-701]
---

## Goal

Cohortele (CX module) nu au filială. Un manager de filială vede toate cohortele din toate filialele. Adăugăm `branchId` pe cohorte și aplicăm branch filter pe route.

## User stories

- Ca manager de filială, vreau să văd doar cohortele filialei mele în CX, pentru că nu am acces la alte filiale.
- Ca director de rețea, vreau să pot filtra cohortele pe filială în CX, pentru că văd situația per locație.
- Ca sistem, vreau că la crearea unei cohorte, `branchId`-ul să fie setat automat din contextul filialei active, pentru că nu e nevoie să selectez manual.

## Acceptance criteria

1. Migrare `0035_integ103_cohorts_branch.sql` adaugă:
   - `branch_id UUID REFERENCES branches(id) ON DELETE SET NULL` pe tabela `cohorts`
   - Nullable (backward compatible)

2. Schema drizzle `server/db/schema/cohorts.ts` include `branchId`.

3. Route `server/routes/cohorts.ts`:
   - `cohortSchema` acceptă opțional `branchId`
   - `GET /api/cohorts` aplică `withBranchFilter` (același pattern ca `students`)
   - `POST /api/cohorts` salvează `branchId` din body sau din contextul user-ului

4. Frontend `CXPage.tsx`:
   - La crearea unei cohorte, `branchId` se trimite automat (din `BranchContext`)
   - Cohortele afișate sunt filtrate per filialei active

5. Migrare fără erori.

## Files touched

- `server/db/schema/cohorts.ts`
- `server/routes/cohorts.ts`
- `src/pages/app/CXPage.tsx`
- `src/lib/api/cohorts.ts` — adaugă `branchId` în tipul `Cohort`
- `drizzle/` — migrare `0035_integ103_...`

## Tests

- Unit: `cohorts.branchId` se salvează
- Unit: `GET /api/cohorts` cu branch filter returnează doar cohortele filialei
- Integration: creare cohortă cu `branchId` → persistat

## DoD

- [ ] Migrare generată și committată
- [ ] `db:reset && db:seed` trece
- [ ] withBranchFilter aplicat pe cohorts route
- [ ] Tests verzi

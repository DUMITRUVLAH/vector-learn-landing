---
id: BRANCH-702
title: "Roluri scoped pe filială + Branch Manager view"
milestone: BRANCH
phase: "1 — Foundation"
priority: P0
slug: scoped-roles
depends_on: [BRANCH-701]
status: pending
---

# BRANCH-702 — Roluri scoped pe filială + Branch Manager view

## Goal

Managerul unei filiale vede DOAR datele filialei sale (studenți, profesori, lecții, plăți).
Owner-ul de rețea vede totul. API-ul aplică automat filtrul `branch_id` pentru userii cu
rol `branch_manager`. Pagina `/app/settings/branches` câștigă tab „Manageri".

## In scope

- Coloana `branch_scope` (nullable UUID FK branches) pe tabelul `users` — migrare 0034
- Middleware `requireBranchScope`: dacă `user.role == 'branch_manager'`, injectează
  `user.branchScope` în context; toate rutele care returnează date per-filială aplică
  filtrul `WHERE branch_id = user.branchScope` (sau `IN user.branchScope` pentru lista)
- Roluri extinse: `owner | admin | teacher | branch_manager` (adăugăm `branch_manager`
  la enum dacă nu există, sau folosim câmpul `branch_scope` non-null ca indicator)
- `PATCH /api/branches/:id` — câmpul `managerUserId` setează utilizatorul manager al filialei
  și setează `users.branch_scope = branch.id` pentru acel user
- UI în `/app/settings/branches`:
  - Tab „Manageri" — tabel cu user + filială atribuită + buton „Asignează manager"
  - Modal „Asignează manager" — dropdown users + buton save
- Rutele `/api/students`, `/api/teachers`, `/api/lessons` aplică filtrul branch_scope
  când user e branch_manager (serverside, transparent)

## Out of scope

- Permisiuni granulare per resource (RBAC complet) — pentru SET-8xx
- Multi-branch manager (un user = manager la 2 filiale) — P2

## User stories

- Ca Owner, vreau managerul X să vadă DOAR filiala lui, pentru că datele celorlalți sunt private. (US-MF-05)
- Ca Branch Manager, vreau să văd studenții și profesorii filialei mele, pentru că am responsabilitate locală. (US-MF-05)
- Ca Director rețea, vreau să asignez un manager la o filială din interfață, pentru că administrez rețeaua. (US-MF-20)

## Acceptance criteria

- [ ] Coloana `users.branch_scope` creată, migrare 0034 commitată
- [ ] PATCH /api/branches/:id `{ managerUserId }` → seată users.branch_scope
- [ ] GET /api/students cu user branch_manager → returnează doar studenții filialei
- [ ] GET /api/teachers cu user branch_manager → returnează doar profesorii filialei
- [ ] Owner/admin vede toate filialele (fără restricție)
- [ ] Tab „Manageri" în BranchesPage cu asignare manager funcțional
- [ ] Tenant isolation menținut (branch_scope nu poate să cruce tenant-uri)

## Files

### New
- `drizzle/0034_branch702_user_branch_scope.sql`
- `server/middleware/requireBranchScope.ts`
- `src/components/branches/AssignManagerModal.tsx`

### Modified
- `server/db/schema/users.ts` — add branchScope
- `server/routes/students.ts` — apply branch_scope filter
- `server/routes/teachers.ts` — apply branch_scope filter
- `server/routes/lessons.ts` — apply branch_scope filter
- `server/routes/branches.ts` — PATCH managerUserId logic
- `src/pages/app/settings/BranchesPage.tsx` — add Managers tab

## Tests

1. [blocant] Migration gate: 0034 commitată, db:reset+db:seed succed
2. [blocant] PATCH /api/branches/:id cu managerUserId → user.branch_scope setat corect
3. [blocant] GET /api/students cu token branch_manager → filtrare pe branch_scope
4. [blocant] GET /api/students cu token owner → fără filtru, vede tot
5. [normal] Tab „Manageri" renders în BranchesPage
6. [normal] AssignManagerModal randează dropdown cu utilizatori disponibili
7. [normal] Cross-tenant: branch_scope nu poate referi filiale din alt tenant

## DoD

Standard — toate criteriile [blocant] verzi, reviewer APPROVED, integration-architect CONNECTED.

---
id: BRANCH-701
title: "Schema filiale + branch_id pe tabele cheie + branch switcher UI"
milestone: BRANCH
phase: "1 — Foundation"
priority: P0
slug: schema-switcher
depends_on: [MVP-004, MVP-005, MVP-006]
status: pending
---

# BRANCH-701 — Tabel `branches` + branch_id + Branch Switcher

## Goal

Introducem entitatea `branches` (filiale) sub fiecare tenant. Students, teachers, lessons și
courses capătă câmpul `branch_id` (nullable — null = "Default / nealocat"). Un dropdown în
AppShell permite filtrarea contextului vizual pe o filială sau "Toate filialele".
Această fundație permite tot modulul BRANCH.

## In scope

- Schema `branches`:
  - `id UUID PK`, `tenant_id UUID FK tenants`, `name VARCHAR(100)`, `address TEXT`
  - `manager_user_id UUID FK users NULLABLE`
  - `is_default BOOLEAN DEFAULT false` (exact una per tenant poate fi default)
  - `created_at`, `updated_at`
- Migrare `0033_branch701_branches.sql`:
  - CREATE TABLE branches
  - ADD COLUMN `branch_id UUID NULLABLE REFERENCES branches(id) ON DELETE SET NULL` pe:
    - `students`, `teachers`, `lessons`, `courses`
  - Index `branch_id` pe fiecare tabel
- `POST /api/branches` — creare filială (name, address, managerUserId)
- `GET /api/branches` — lista filiale tenant-scoped
- `PATCH /api/branches/:id` — update name/address/manager
- `DELETE /api/branches/:id` — ștergere (soft-block dacă are >0 students/teachers)
- Pagina `/app/settings/branches`:
  - Card per filială: nume, adresă, număr elevi, număr profesori, buton Edit/Delete
  - Buton "Adaugă filială" → modal cu name + address
- Branch Switcher în AppShell (header sau sidebar):
  - Dropdown cu "Toate filialele" + lista ramuri
  - Selecția se salvează în `localStorage` ca `activeBranchId`
  - Componentă `useBranch()` hook care citește `activeBranchId` din localStorage
  - Pagina LeadsPage, StudentsPage, LessonsPage pasează `?branch_id=<id>` la API când un branch e activ

## Out of scope

- Branch-scoped roles (BRANCH-702)
- Pricing per branch (BRANCH-703+)
- Transfer student/teacher (BRANCH-704)

## User stories

- Ca Owner, vreau să definesc 2+ filiale sub același tenant, pentru că raportez consolidat. (US-MF-01)
- Ca Director, vreau dropdown "Toate / București / Cluj" în header, pentru că filtrez vizualizările rapid. (US-MF-02)
- Ca Manager, vreau să văd câți elevi și profesori are filiala mea, pentru că am context imediat. (US-MF-01)

## Acceptance criteria

- [ ] Tabel `branches` creat, migrare 0033 commitată, db:reset+db:seed succed
- [ ] Coloanele `branch_id` adăugate pe students, teachers, lessons, courses
- [ ] POST /api/branches → 201, GET /api/branches → lista tenant-scoped
- [ ] Pagina `/app/settings/branches` randează lista filiale + buton adaugă
- [ ] BranchSwitcher dropdown vizibil în AppShell
- [ ] `useBranch()` hook returnează `activeBranchId` din localStorage
- [ ] Dark mode: dropdown și cards vizibile în ambele teme
- [ ] Tenant isolation: filialele unui tenant nu apar la altul

## Files

### New
- `server/db/schema/branches.ts`
- `drizzle/0033_branch701_branches.sql`
- `server/routes/branches.ts`
- `src/hooks/useBranch.ts`
- `src/components/app/BranchSwitcher.tsx`
- `src/pages/app/settings/BranchesPage.tsx`
- `src/components/branches/BranchCard.tsx`
- `src/components/branches/AddBranchModal.tsx`
- `src/lib/api/branches.ts`

### Modified
- `server/db/schema/index.ts` — export branches
- `server/db/schema/students.ts` — add branchId
- `server/db/schema/teachers.ts` — add branchId
- `server/db/schema/lessons.ts` — add branchId
- `server/db/schema/courses.ts` — add branchId
- `server/app.ts` — mount /api/branches
- `src/components/app/AppShell.tsx` — add BranchSwitcher
- `src/App.tsx` — add /app/settings/branches route

## Tests

1. [blocant] Migration gate: 0033 commitată, db:reset+db:seed succed
2. [blocant] POST /api/branches `{ name: "Cluj", address: "Str. X 1" }` → 201, id UUID
3. [blocant] GET /api/branches → 200, array cu obiectele create, tenant-scoped
4. [blocant] students schema include coloana branch_id (nullable)
5. [blocant] BranchesPage renders fără crash (list + add button vizibil)
6. [blocant] BranchSwitcher renders în AppShell, dropdown cu "Toate filialele"
7. [blocant] useBranch() returnează null când nicio filială nu e selectată
8. [normal] useBranch() returnează branchId după setActiveBranch(id)
9. [normal] DELETE /api/branches/:id cu students → 409 (cannot delete with students)
10. [normal] PATCH /api/branches/:id → 200, name updated

## DoD

- Toate criteriile [blocant] verzi
- Reviewer APPROVED + integration-architect CONNECTED
- Persona reports salvate
- PR pe branch `feat/BRANCH-faza-1-branches`

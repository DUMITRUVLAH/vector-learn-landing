---
id: BRANCH-701
title: Schema branches — tabel branches + branch_id pe students/teachers/lessons
milestone: BRANCH
phase: "1"
branch: feat/BRANCH-faza-1-multifiliale
status: pending
attempts: 0
depends_on: []
---

## Goal

Adăugăm suportul multi-filiale la nivel de bază de date: tabel `branches` cu meta-date per
filială (nume, adresă, manager), câmpul opțional `branch_id` pe tabelele cheie (`students`,
`teachers`, `lessons`, `courses`), și un seed initial cu "Filiala Implicită" pentru a nu rompe
datele existente. Aceasta este fundația pe care se vor construi filtrele, permisiunile și
rapoartele din BRANCH-702..704.

## User stories

- Ca owner de rețea, vreau să definesc 2+ filiale sub același tenant, pentru că am centre în mai multe orașe și vreau să raportez consolidat.
- Ca manager de filială, vreau că datele mele (elevi, profesori, lecții) sunt grupate pe filiala mea, pentru că nu mă interesează ce se întâmplă la celelalte filiale.
- Ca sistem, vreau că datele existente să fie asociate cu o "Filialăde Implicită", pentru că altfel toate query-urile cu branch_id NOT NULL ar returna zero rânduri.
- Ca developer, vreau că branch_id este nullable pe toate tabelele cheie, pentru că centrele cu o singură filială nu ar trebui forțate să configureze branches.

## Acceptance criteria

1. Tabel `branches`:
   - `id` UUID PK
   - `tenant_id` UUID FK → tenants (cascade delete)
   - `name` VARCHAR(200) NOT NULL
   - `address` TEXT nullable
   - `manager_user_id` UUID FK → users (set null)
   - `is_default` BOOLEAN DEFAULT false (un singur default per tenant)
   - `created_at`, `updated_at` TIMESTAMP

2. Coloane adăugate (nullable, fără DEFAULT forțat, fără backfill în migrare):
   - `students.branch_id` UUID FK → branches (set null)
   - `teachers.branch_id` UUID FK → branches (set null)
   - `lessons.branch_id` UUID FK → branches (set null)
   - `courses.branch_id` UUID FK → branches (set null)

3. Indexuri pe `branch_id` pentru fiecare tabel modificat.

4. API CRUD pentru branches:
   - `GET /api/branches` — listare filiale pentru tenant curent
   - `POST /api/branches` — creare filială nouă
   - `PUT /api/branches/:id` — editare
   - `DELETE /api/branches/:id` — ștergere (nu dacă is_default)
   - `GET /api/branches/current` — returnează filiala activă a utilizatorului curent

5. Seeder: `db:seed` creează o filială implicită ("Filiala Principală") pentru fiecare tenant existent.

6. Migration comisă.

7. Build + typecheck + lint + unit tests verzi.

## Files

### New
- `server/db/schema/branches.ts` — tabel branches
- `server/routes/branches.ts` — CRUD branches API
- `src/lib/api/branches.ts` — client API helpers
- `src/__tests__/branches.test.ts` — unit tests

### Modified
- `server/db/schema/students.ts` — add branch_id
- `server/db/schema/teachers.ts` — add branch_id
- `server/db/schema/lessons.ts` — add branch_id
- `server/db/schema/courses.ts` — add branch_id
- `server/db/schema/index.ts` — export branches
- `server/app.ts` — mount branches routes
- `server/db/seed.ts` — add default branch seeding

## Tests

- **T-BRANCH-701-1** [blocant] Given the app is running, When GET /api/branches with auth, Then returns 200 with array.
- **T-BRANCH-701-2** [blocant] When POST /api/branches with valid body, Then returns 201 with created branch.
- **T-BRANCH-701-3** [blocant] Migration: db:reset + db:seed succeed — no migration collision.
- **T-BRANCH-701-4** [normal] POST /api/branches with duplicate name for same tenant returns 409 or unique branch via name differentiation.
- **T-BRANCH-701-5** [normal] DELETE /api/branches/:id on default branch returns 400.
- **T-BRANCH-701-6** [normal] GET /api/branches returns only branches for the current tenant.

## DoD

- [ ] Migration committed
- [ ] Build + typecheck + lint green
- [ ] Unit tests green
- [ ] Reviewer APPROVED
- [ ] PR on `feat/BRANCH-faza-1-multifiliale`

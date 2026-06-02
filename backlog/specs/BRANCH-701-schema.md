---
id: BRANCH-701
title: "Branches schema + branch_id pe entități (US-MF-01)"
milestone: BRANCH
phase: "1 — Fundație"
priority: P0
slug: branches-schema
depends_on: ["MVP-002", "MVP-004", "MVP-005"]
status: pending
---

# BRANCH-701 — Branches schema + branch_id pe entități

## Goal

Definește tabelul `branches` per tenant și adaugă `branch_id` (nullable) pe students, teachers, lessons, courses. Backfill "Default branch" pentru toți rowii existenți. Această migrare este fundația pe care stă tot modulul Multifiliale.

## In scope

- Tabel `branches`:
  - `id`, `tenant_id`, `name` VARCHAR(200), `address` VARCHAR(500), `manager_user_id` UUID (nullable, FK → users)
  - `status` ENUM `active | archived`
  - `created_at`, `updated_at`
  - Migrare 0016 (urmează 0015_fin604)
- Câmp `branch_id UUID NULLABLE FK → branches` pe: `students`, `teachers`, `lessons`, `courses`
  - Migrare 0016 tot (ALTER TABLE pentru fiecare)
- La creare tenant, se creează automat un "Default branch" cu `name = 'Sediul principal'`
- API:
  - `POST /api/branches` — creare filială (admin only)
  - `GET /api/branches` — lista filiale tenant-scoped
  - `PATCH /api/branches/:id` — update name/address/manager
  - `DELETE /api/branches/:id` — archive (nu sterge fizic)
- Seed actualizat: firstBranch creat în seed, toate students/teachers/lessons din seed au `branch_id = firstBranch.id`

## Out of scope

- Branch switcher UI (BRANCH-702)
- Scoped permissions (BRANCH-703)
- Cross-branch reports (BRANCH-704)

## User stories

- US-MF-01: Tabel branches per tenant

## Acceptance criteria

- [ ] Tabel `branches` creat, migrare 0016 commitată
- [ ] Câmp `branch_id` adăugat pe students, teachers, lessons, courses
- [ ] POST /api/branches → 201 cu branch nou
- [ ] GET /api/branches → lista tenant-scoped
- [ ] PATCH /api/branches/:id → actualizare name/address
- [ ] DELETE /api/branches/:id → status `archived`
- [ ] Seed crează Default branch + setează branch_id pe toate entitățile
- [ ] db:reset + db:seed succed

## Files

### New
- `server/db/schema/branches.ts`
- `drizzle/0016_branch701_branches.sql`
- `server/routes/branches.ts`
- `src/lib/api/branches.ts`

### Modified
- `server/db/schema/index.ts` — export branches
- `server/db/schema/students.ts` — add branch_id
- `server/db/schema/teachers.ts` — add branch_id
- `server/db/schema/lessons.ts` — add branch_id
- `server/db/schema/courses.ts` — add branch_id
- `server/app.ts` — mount branchRoutes
- `server/db/seed.ts` — create Default branch + set branch_id

## Tests

1. [blocant] Migration gate: 0016 commitată, db:reset+db:seed succed
2. [blocant] POST /api/branches `{ name: "Cluj", address: "Str. Test 1" }` → 201
3. [blocant] GET /api/branches → array cu cel puțin 1 branch (Default)
4. [blocant] PATCH /api/branches/:id `{ name: "Cluj-Napoca" }` → 200
5. [blocant] DELETE /api/branches/:id → status archived
6. [normal] Branch student render: students tabel acceptă branch_id fără crash
7. [normal] Seed verifică branch_id setat pe students

## DoD

Standard — toate criteriile [blocant] verzi, reviewer APPROVED, integration-architect CONNECTED.

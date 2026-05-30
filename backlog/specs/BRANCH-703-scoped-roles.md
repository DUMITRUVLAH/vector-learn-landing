---
id: BRANCH-703
title: "Roluri scoped pe filială — manager vede doar filiala lui (US-MF-05, US-MF-20)"
milestone: BRANCH
phase: "3 — Permissions"
priority: P0
slug: scoped-roles
depends_on: ["BRANCH-701", "BRANCH-702"]
status: pending
---

# BRANCH-703 — Roluri scoped pe filială

## Goal

Un manager de filială poate vedea și modifica DOAR datele filialei lui. Owner-ul/admin-ul vede toate filialele. Implementat prin câmpul `branch_scope` pe users + middleware care injectează branch filter în toate query-urile.

## In scope

- Câmp `branch_scope UUID NULLABLE FK → branches` pe tabelul `users` (migrare 0017 sau extins 0016)
  - `NULL` = acces la toate filialele (owner/admin)
  - UUID specific = acces doar la filiala respectivă
- Middleware `requireBranchScope`: extrage `branch_scope` din session user, injectează în `AuthVariables`
- Update routes: students, teachers, lessons, courses, invoices — dacă user are `branch_scope`, `AND branch_id = branch_scope`
- API `PATCH /api/users/:id/branch-scope` — admin only, setează branch_scope pe un user
- UI `/app/settings/users` (stub — e în SET-8xx, dar buton "Asignează filială" e necesar acum)
  - Sau: endpoint expus, UI vine în SET-8xx

## Out of scope

- Full users management UI (SET-8xx)
- Cross-branch reports (BRANCH-704)

## User stories

- US-MF-05: Roluri scoped pe branch
- US-MF-20: Permission inheritance

## Acceptance criteria

- [ ] Câmp `branch_scope` pe users, migrare commitată
- [ ] User cu branch_scope = "cluj-id" → GET /api/students returnează DOAR elevi din Cluj
- [ ] User cu branch_scope = NULL → GET /api/students returnează toți elevii (ca acum)
- [ ] PATCH /api/users/:id/branch-scope → 200
- [ ] Middleware injectează branch_scope în toate route-urile sensibile
- [ ] Lecții și plăți sunt și ele filtrate de branch_scope

## Files

### New
- `drizzle/0017_branch703_user_scope.sql`
- `server/middleware/branchScope.ts`

### Modified
- `server/db/schema/users.ts` — add branch_scope
- `server/middleware/requireAuth.ts` — adaugă branchScope în AuthVariables
- `server/routes/students.ts`, `teachers.ts`, `lessons.ts`, `invoices.ts` — apply scope filter

## Tests

1. [blocant] Migration gate: 0017 commitată, db:reset+db:seed succed
2. [blocant] User cu branch_scope = branchId → GET /api/students returnează doar elevi cu branch_id = branchId
3. [blocant] User cu branch_scope = NULL → GET /api/students returnează toți elevii tenant-ului
4. [blocant] PATCH /api/users/:id/branch-scope `{ branchId: "..." }` → 200
5. [normal] Lectii filtrate: user cu scope → GET /api/lessons filtrează

## DoD

Standard — toate criteriile [blocant] verzi, reviewer APPROVED, integration-architect CONNECTED.

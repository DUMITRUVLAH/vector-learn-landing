---
id: BRANCH-703
title: Branch-scoped permissions — branch_scope pe users + middleware guard
milestone: BRANCH
phase: "1"
branch: feat/BRANCH-faza-1-multifiliale
status: pending
attempts: 0
depends_on: [BRANCH-701]
---

## Goal

Managerii de filială trebuie să vadă NUMAI datele filialei lor. Adăugăm câmpul `branch_scope`
pe tabelul `users` (null = acces la tot; UUID = restricționat la acea filială), și un middleware
`requireBranchScope` care aplică automat filtrul `WHERE branch_id = user.branchScope` pe
query-urile sensibile. Owner-ul / admin-ul global continuă să vadă toate filialele.

## User stories

- Ca owner de rețea, vreau că managerul X vede DOAR filiala lui, pentru că datele celorlalte filiale sunt confidențiale.
- Ca manager de filială, vreau să pot accesa complet datele filialei mele fără să văd sau să modific nimic din altă filială.
- Ca sistem, vreau că branch_scope este verificat server-side la fiecare request, pentru că nu mă bazez pe filtrul din UI.
- Ca admin de rețea, vreau să pot seta branch_scope pentru fiecare user din panoul de settings, pentru că noul manager al filialei Cluj trebuie restricționat.

## Acceptance criteria

1. Coloană `branch_scope` UUID nullable pe `users` (FK → branches, set null). Indexat.

2. Middleware helper `withBranchFilter(user, query)` care:
   - Dacă `user.branchScope !== null`: adaugă `AND branch_id = user.branchScope` la query.
   - Dacă `user.branchScope === null`: returnează query neschimbat (acces total).

3. API `GET /api/students`, `GET /api/teachers`, `GET /api/lessons` aplică `withBranchFilter`.

4. API `PUT /api/branches/:id/users/:userId/scope` — setează `branch_scope` pentru un user (numai owner/admin).

5. `requireAuth` expune `branchScope` pe `c.get("user")`.

6. UI (opțional, non-blocking): în pagina `/app/settings/team`, coloana "Filială" + dropdown pentru owner să seteze scope.

7. Migration pentru `users.branch_scope` comisă.

## Files

### New
- `server/middleware/branchScope.ts` — withBranchFilter helper

### Modified
- `server/db/schema/users.ts` — add branch_scope column
- `server/middleware/requireAuth.ts` — expose branchScope in user object
- `server/routes/students.ts` — apply withBranchFilter
- `server/routes/teachers.ts` — apply withBranchFilter
- `server/routes/lessons.ts` — apply withBranchFilter
- `server/routes/branches.ts` — add PUT /:id/users/:userId/scope endpoint

## Tests

- **T-BRANCH-703-1** [blocant] Migration: users.branch_scope column exists after db:reset.
- **T-BRANCH-703-2** [blocant] withBranchFilter adds branch_id condition when branchScope is set.
- **T-BRANCH-703-3** [normal] withBranchFilter returns query unchanged when branchScope is null.
- **T-BRANCH-703-4** [normal] GET /api/students with branchScope user returns only that branch's students.
- **T-BRANCH-703-5** [normal] PUT /api/branches/:id/users/:userId/scope requires owner/admin role.

## DoD

- [ ] Migration committed
- [ ] Build + typecheck + lint green
- [ ] Unit tests green
- [ ] Reviewer APPROVED
- [ ] PR on `feat/BRANCH-faza-1-multifiliale`

---
id: BRANCH-702
title: Branch switcher UI + BranchContext — selector filiale în AppShell
milestone: BRANCH
phase: "1"
branch: feat/BRANCH-faza-1-multifiliale
status: pending
attempts: 0
depends_on: [BRANCH-701]
---

## Goal

Adăugăm un dropdown "Toate filialele / București / Cluj" în header-ul AppShell, care stochează
filiala selectată în localStorage și un React context (`BranchContext`). Toate paginile care
listează date (elevi, profesori, orar, plăți) vor putea accesa contextul și filtra serverul cu
`?branchId=`. Managerii cu `branch_scope` restricționat văd automat doar filiala lor (nu pot schimba).

## User stories

- Ca director de rețea, vreau un dropdown "Toate / București / Cluj" în header, pentru că vreau să văd datele unei filiale specifice fără să schimb URL-ul.
- Ca manager de filială, vreau că selectorul este fixat pe filiala mea și nu pot selecta altele, pentru că nu am acces la datele celorlalți.
- Ca sistem, vreau că selecția se păstrează între sesiuni prin localStorage, pentru că nu vreau să re-selectez filiala la fiecare refresh.
- Ca developer, vreau un BranchContext global care expune branchId selectat, pentru că nu vreau prop-drilling prin 20 de componente.

## Acceptance criteria

1. `BranchContext` (React context + provider) expune:
   - `activeBranchId: string | null` — null = toate filialele
   - `setActiveBranchId(id: string | null): void`
   - `branches: Branch[]` — lista tuturor filialelor pentru tenant
   - `loading: boolean`

2. `BranchProvider` în `App.tsx` (wrap la nivel de app, sub auth).

3. Componenta `BranchSwitcher` în `AppShell` header:
   - Vizibilă numai dacă există ≥ 2 filiale sau user-ul este owner/admin.
   - Dropdown cu opțiuni: "Toate filialele", urmate de filialele tenant-ului.
   - Selecția curentă persistată în `localStorage["active_branch_id"]`.
   - Managers cu `branch_scope` restricționat (BRANCH-703) văd doar propria filială — dropdown dezactivat.

4. Useage pattern: orice pagină importă `useBranch()` și transmite `?branchId=` la fetch-urile API.

5. Pagina `StudentsPage` demonstrează filtrarea: dacă `activeBranchId !== null`, adaugă `?branchId=` la `GET /api/students`.

6. API `GET /api/students` suportă query param `branchId` (filtrare facultativă — nu breaking).

## Files

### New
- `src/contexts/BranchContext.tsx` — BranchContext + BranchProvider + useBranch hook
- `src/components/app/BranchSwitcher.tsx` — dropdown selector component

### Modified
- `src/App.tsx` — wrap routes in BranchProvider
- `src/components/app/AppShell.tsx` — add BranchSwitcher to header
- `server/routes/students.ts` — support ?branchId query param
- `src/pages/app/StudentsPage.tsx` — use useBranch() for filtering

## Tests

- **T-BRANCH-702-1** [blocant] BranchSwitcher renders without crash.
- **T-BRANCH-702-2** [blocant] BranchContext provides activeBranchId and setActiveBranchId.
- **T-BRANCH-702-3** [normal] Selecting a branch in BranchSwitcher updates activeBranchId.
- **T-BRANCH-702-4** [normal] activeBranchId is persisted to localStorage on change.
- **T-BRANCH-702-5** [normal] GET /api/students?branchId=X returns only students from that branch.

## DoD

- [ ] No new migrations
- [ ] Build + typecheck + lint green
- [ ] Unit tests green
- [ ] Reviewer APPROVED
- [ ] PR on `feat/BRANCH-faza-1-multifiliale`

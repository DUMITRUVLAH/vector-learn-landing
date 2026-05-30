---
id: BRANCH-702
title: "Branch switcher UI + filtrare globală pe filială (US-MF-02)"
milestone: BRANCH
phase: "2 — UI Switcher"
priority: P0
slug: branch-switcher
depends_on: ["BRANCH-701"]
status: pending
---

# BRANCH-702 — Branch switcher UI + filtrare globală

## Goal

Adaugă un dropdown "Toate / Sediul principal / Cluj / ..." în AppShell care setează un `branchFilter` context global. Toate paginile (Students, Teachers, Lessons, Invoices) filtrează datele după `branchFilter` activ. Starea se salvează în `localStorage`.

## In scope

- `BranchContext` (React context) cu `activeBranch: string | "all"` și setter
- `BranchSwitcher` component în AppShell header — dropdown cu filialele tenantului
- Opțiunea "Toate filialele" (value = "all") = comportamentul actual
- Propagare: paginile care listează students/teachers/lessons/courses pasează `branch_id` ca query param la API
- API update: `GET /api/students?branch_id=<id>` + `GET /api/lessons?branch_id=<id>` — filtrare opțională
- `localStorage` key `vl_active_branch` — persistă selecția între refresh-uri
- Badge cu numărul filialei selectate în AppShell când nu e "Toate"

## Out of scope

- Creare/editare filiale din UI (BRANCH-701 are API, settings UI vine în SET-8xx)
- Scoped permissions / access control (BRANCH-703)

## User stories

- US-MF-02: Branch switcher în UI

## Acceptance criteria

- [ ] `BranchSwitcher` apare în AppShell header cu lista filialelor
- [ ] Selectând o filială, pagina Students afișează doar elevii acelei filiale
- [ ] Selectând "Toate", afișează toți elevii
- [ ] Selecția se persistă în localStorage și se restaurează la refresh
- [ ] Badge vizibil când o filială specifică e selectată
- [ ] GET /api/students?branch_id=<id> → elevi filtrați
- [ ] GET /api/lessons?branch_id=<id> → lecții filtrate
- [ ] Dark mode funcționează pe dropdown

## Files

### New
- `src/contexts/BranchContext.tsx`
- `src/components/app/BranchSwitcher.tsx`

### Modified
- `src/components/app/AppShell.tsx` — include BranchSwitcher
- `src/lib/api/students.ts` — add branch_id filter param
- `src/lib/api/lessons.ts` (nou dacă nu există) sau `payments.ts`
- `server/routes/students.ts` — filter by branch_id
- `server/routes/lessons.ts` — filter by branch_id

## Tests

1. [blocant] BranchSwitcher renders with "Toate filialele" option
2. [blocant] Selectând o filială → studentsApi este chemat cu branch_id
3. [blocant] "Toate" → studentsApi este chemat fără branch_id
4. [blocant] BranchContext persistă în localStorage
5. [normal] Dark mode: dropdown are classes cu semantic tokens

## DoD

Standard — toate criteriile [blocant] verzi, reviewer APPROVED, integration-architect CONNECTED.

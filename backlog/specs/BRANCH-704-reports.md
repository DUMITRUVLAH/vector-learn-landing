---
id: BRANCH-704
title: Rapoarte consolidate vs per-filială — dashboard comparativ + rollup
milestone: BRANCH
phase: "1"
branch: feat/BRANCH-faza-1-multifiliale
status: pending
attempts: 0
depends_on: [BRANCH-701, BRANCH-702]
---

## Goal

Directorul de rețea are nevoie de un dashboard care arată KPI-urile per filială (elevi activi,
venit lunar, rata de retenție) plus un view "consolidat" la nivel de rețea. Adăugăm pagina
`BranchReportsPage` cu un toggle "Consolidat / Per filială" și carduri comparabile side-by-side.

## User stories

- Ca director de rețea, vreau să compar filialele pe MRR + elevi activi, pentru că identific best/worst performer.
- Ca owner, vreau un view consolidat al întregii rețele (total elevi, total venit), pentru că raportez investitorului la nivel de grup.
- Ca manager de filială, vreau să văd KPI-urile filialei mele în raport cu media rețelei, pentru că știu dacă sunt sub sau peste medie.
- Ca contabil, vreau să export raportul per filială ca CSV, pentru că trebuie să îl integrez în sistemul de contabilitate al holdingului.

## Acceptance criteria

1. API `GET /api/branches/reports/kpi?from=YYYY-MM-DD&to=YYYY-MM-DD` — returnează:
   ```json
   {
     "consolidated": { "activeStudents": N, "monthlyRevenue": N, "retentionRate": N },
     "byBranch": [
       { "branchId": "...", "branchName": "...", "activeStudents": N, "monthlyRevenue": N, "retentionRate": N }
     ]
   }
   ```
   - `activeStudents`: COUNT students WHERE status='active' AND branch_id=X
   - `monthlyRevenue`: SUM payments.amount WHERE paid_at BETWEEN from AND to AND branch_id=X
   - `retentionRate`: students activi la finalul intervalului / studenți activi la început (0-100)

2. UI `BranchReportsPage` (`/app/branches/reports`):
   - Toggle "Consolidat / Per filială"
   - View consolidat: 3 carduri mari (Elevi activi, Venit total, Rată retenție)
   - View per filială: grid de carduri, un card per filială, cu badge color-coded (verde/galben/roșu vs medie)
   - Date picker pentru interval
   - Buton "Export CSV" pentru view-ul curent

3. Route `/app/branches/reports` în `App.tsx`.

4. Link "Rapoarte filiale" în sidebar (numai dacă tenant are ≥ 2 filiale SAU user e owner).

5. Branch-scoped: dacă user are branchScope setat, afișează numai propria filială.

## Files

### New
- `server/routes/branchReports.ts` — KPI endpoint
- `src/pages/app/BranchReportsPage.tsx` — dashboard UI
- `src/__tests__/branch-reports.test.tsx` — unit tests

### Modified
- `server/app.ts` — mount branchReports routes
- `src/App.tsx` — add route
- `src/components/app/AppShell.tsx` — add sidebar link
- `src/lib/api/branches.ts` — add KPI API helper

## Tests

- **T-BRANCH-704-1** [blocant] GET /api/branches/reports/kpi returns 200 with consolidated and byBranch.
- **T-BRANCH-704-2** [blocant] BranchReportsPage renders without crash.
- **T-BRANCH-704-3** [normal] consolidated.activeStudents equals sum of all branches' activeStudents.
- **T-BRANCH-704-4** [normal] Export CSV button triggers download with correct headers.
- **T-BRANCH-704-5** [normal] Toggle between "Consolidat" and "Per filială" renders different UI sections.

## DoD

- [ ] No new migrations (data from existing tables filtered by branch_id)
- [ ] Build + typecheck + lint green
- [ ] Unit tests green
- [ ] Reviewer APPROVED
- [ ] PR on `feat/BRANCH-faza-1-multifiliale`

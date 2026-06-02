---
id: BRANCH-703
title: "Rapoarte consolidate vs per-filială — revenue, elevi, utilizare profesori"
milestone: BRANCH
phase: "1 — Foundation"
priority: P0
slug: consolidated-reports
depends_on: [BRANCH-701, BRANCH-702]
status: pending
---

# BRANCH-703 — Rapoarte consolidate vs per-filială

## Goal

Owner-ul de rețea vede un dashboard cu KPI-uri side-by-side: revenue total vs per filială,
număr de elevi activi per filială, și utilizarea profesorilor. Toggle „Consolidat / Per Filială"
controlează granularitatea. Directoarea de filială vede același dashboard dar filtrat pe filiala ei.

## In scope

- `GET /api/branches/stats` — returnează per-filială:
  - `branchId`, `branchName`, `studentCount`, `teacherCount`
  - `revenueCurrentMonth` (sum payments created_at în luna curentă)
  - `lessonCount` (lessons în luna curentă)
- `GET /api/branches/rollup` — sumă consolidată a tuturor filialelor tenantului:
  - `totalStudents`, `totalTeachers`, `totalRevenue`, `totalLessons`
  - Array `branches[]` cu aceleași câmpuri ca /stats
- Pagina `/app/branches` (sau tab în `/app/reports`):
  - Toggle „Consolidat / Per filială"
  - Mod consolidat: 4 KPI cards (total students, total revenue, total lessons, active branches)
  - Mod per-filială: tabel cu coloane Filială, Elevi, Profesori, Venit luna curentă, Lecții
  - Pentru branch_manager: automat filtrat pe filiala proprie (no toggle)
- Link „Detalii →" per filială → /app/students?branch_id=<id>

## Out of scope

- Hartă geografică cu pin-uri (US-MF-10) — P2
- KPI compare side-by-side chart (US-MF-16) — viitor
- Royalty calculation (US-MF-11) — viitor

## User stories

- Ca Director rețea, vreau toggle „consolidat / per filială" să văd ambele imagini. (US-MF-09)
- Ca Owner, vreau revenue total și per filială în același ecran, pentru că identific best/worst. (US-MF-16)
- Ca Branch Manager, vreau să văd KPI-urile filialei mele, pentru că am responsabilitate financiară. (US-MF-09)

## Acceptance criteria

- [ ] GET /api/branches/stats → 200, array per filială cu studentCount + revenueCurrentMonth
- [ ] GET /api/branches/rollup → 200, totalStudents + totalRevenue corecte (sum branches)
- [ ] Pagina /app/branches randează toggle + cards KPI în mod consolidat
- [ ] Tabel per-filială vizibil în mod per-filială cu coloane corecte
- [ ] branch_manager vede doar filiala lui (fără toggle)
- [ ] Tenant isolation: stats nu crossează tenant-uri

## Files

### New
- `src/pages/app/BranchesPage.tsx`
- `src/components/branches/BranchStatsTable.tsx`
- `src/components/branches/BranchKpiCards.tsx`

### Modified
- `server/routes/branches.ts` — add GET /stats + GET /rollup
- `src/App.tsx` — add /app/branches route
- `src/components/app/AppShell.tsx` — add link Filiale în sidebar
- `src/lib/api/branches.ts` — add getBranchStats + getBranchRollup

## Tests

1. [blocant] GET /api/branches/stats → 200, array cu branchId + studentCount + revenueCurrentMonth
2. [blocant] GET /api/branches/rollup → 200, totalStudents = sum studentCount per branches
3. [blocant] BranchesPage renders fără crash, toggle vizibil
4. [blocant] Tenant isolation: /api/branches/rollup cu alt tenant → date separate
5. [normal] Mod consolidat: 4 KPI cards randează
6. [normal] Mod per-filială: tabel randează cu coloane corecte
7. [normal] branch_manager: stats filtrate pe branch_scope

## DoD

Standard — toate criteriile [blocant] verzi, reviewer APPROVED, integration-architect CONNECTED.

---
id: BRANCH-704
title: "Rapoarte per filială + consolidat (US-MF-09, US-MF-16)"
milestone: BRANCH
phase: "4 — Rapoarte"
priority: P0
slug: branch-reports
depends_on: ["BRANCH-702", "BRANCH-703"]
status: pending
---

# BRANCH-704 — Rapoarte per filială + consolidat

## Goal

Extinde paginile de rapoarte (REP-301..304) cu un toggle "Consolidat / Per filială". Când "Per filială" e selectat, KPI-urile (MRR, studenți activi) se afișează per filială în carduri separate. "Consolidat" = suma totală (comportamentul actual). Adaugă și un tabel side-by-side comparând MRR per filială.

## In scope

- Toggle "Consolidat / Per filială" pe pagina REP-301 Dashboard KPI
- Când "Per filială": afișează un card KPI per branch (MRR, studenți, lecții)
- Tabel comparativ: coloane = filiale, rânduri = KPIs (MRR, Studenți activi, Lecții luna)
- API `GET /api/analytics/branches` — returnează KPIs per branch pentru tenant
  - `{ branches: [{ branchId, branchName, mrr, activeStudents, lessonsThisMonth }] }`
- Filtrare per perioadă (lună, trimestru) — refolosește logica din REP-301

## Out of scope

- Harta geografică (US-MF-10, P2)
- Royalty calculation (US-MF-11, P1 — viitor)

## User stories

- US-MF-09: Rapoarte consolidate vs per-filială
- US-MF-16: KPI compare side-by-side

## Acceptance criteria

- [ ] Toggle "Consolidat / Per filială" vizibil în /app/reports (sau dashboard KPI)
- [ ] Mod "Per filială": carduri separate per branch cu MRR + studenți activi
- [ ] Tabel comparativ: cel puțin 2 coloane când există 2+ filiale
- [ ] GET /api/analytics/branches → 200 cu array branches + KPIs
- [ ] Mod "Consolidat": comportament REP-301 neschimbat
- [ ] Dark mode + tokens pe cards noi

## Files

### New
- `server/routes/analytics-branches.ts`
- `src/components/reports/BranchKpiCards.tsx`

### Modified
- `server/routes/analytics.ts` — add /branches endpoint (sau routes separate)
- `server/app.ts` — mount dacă necesar
- `src/pages/app/ReportsPage.tsx` (sau DashboardPage) — toggle + branch view

## Tests

1. [blocant] GET /api/analytics/branches → 200 cu array valid
2. [blocant] Toggle "Per filială" → afișează BranchKpiCards
3. [blocant] Toggle "Consolidat" → revine la KPI total
4. [normal] BranchKpiCards renders fără crash cu 0 branches
5. [normal] Tabel comparativ cu 2 filiale → 2 coloane

## DoD

Standard — toate criteriile [blocant] verzi, reviewer APPROVED, integration-architect CONNECTED.

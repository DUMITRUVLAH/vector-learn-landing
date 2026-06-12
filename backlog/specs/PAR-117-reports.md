---
id: PAR-117
title: "Rapoarte: spend pe budget code/department/project + aging + cycle time + export CSV"
milestone: PAR
phase: "F"
status: pending
attempts: 0
depends_on: [PAR-113]
spec: backlog/specs/PAR-117-reports.md
core: backlog/par/PAR-CORE.md
---

## Goal

Rapoarte pentru management: cheltuieli agregate pe budget code / department / project / charge_to,
vechimea cererilor (timp în fiecare stare), timpul de ciclu al aprobării (submit → approved), abaterea
plătit vs. estimat, cu export CSV. Tenant-scoped. Reutilizează componentele de chart deja folosite în
repo (recharts).

## User stories

- **Ca** director, **vreau** să văd cheltuielile pe proiect/buget, **pentru că** raportez la donor.
- **Ca** manager, **vreau** să văd unde se blochează aprobările, **pentru că** vreau să accelerez procesul.
- **Ca** finance, **vreau** export CSV, **pentru că** îl folosesc în contabilitate.

## Acceptance criteria

- [ ] `GET /api/par/reports/by-budget` · `by-department` · `by-project` · `by-charge-to` — sume corecte, tenant-scoped, cu filtru de perioadă
- [ ] `GET /api/par/reports/aging` — număr/sumă PAR pe stare + vechime medie
- [ ] `GET /api/par/reports/cycle-time` — timp mediu submit→approved și submit→paid
- [ ] `GET /api/par/reports/export.csv` — export al cererilor filtrate
- [ ] UI `/app/par/reports` cu carduri + chart-uri (recharts) + buton export; light+dark, a11y
- [ ] Calcule pe minor units; doar PAR-uri din tenant; rol approver/finance/par_admin (nu există rol „manager" în PAR — CORE §1)

## Files

**New:**
- `server/routes/parReports.ts`
- `src/pages/par/ParReports.tsx`
- teste `server/routes/__tests__/par-reports.test.ts`

**Modified:**
- `server/app.ts`, `src/App.tsx` — `/app/par/reports`, `src/lib/api/par.ts`

## Tests

- **T-PAR-117-1** [blocant] Given PAR-uri plătite pe 2 budget codes, When `GET /api/par/reports/by-budget`, Then sume corecte per cod, tenant-scoped
- **T-PAR-117-2** [normal] Given export CSV, Then conține rândurile filtrate
- **T-PAR-117-3** [blocant] Live API smoke: login + `GET /api/par/reports/by-budget` → 200

## DoD

- Live-smoke + portability verzi · reviewer APPROVED · personas salvate

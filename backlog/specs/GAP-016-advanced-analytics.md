---
id: GAP-016
title: Analytics avansat — retenție cohortă, LTV per student, top cursuri per venit
milestone: GAP
phase: "5"
branch: feat/GAP-faza-5-operational
depends_on: [GAP-011, GAP-012]
---

## Goal
Extinde dashboard-ul de analytics cu 3 metrici noi relevante pentru directori:
1. Retenție per cohortă: % studenți care revin la același curs în semestrul următor
2. LTV (Lifetime Value) per student: totalul plăților istorice per student, top 10
3. Top cursuri per venit: ranking cursuri după venituri generate luna curentă

## User stories
- Ca director, vreau să văd retenția per cohortă, ca să știu ce cursuri păstrează studenții.
- Ca director, vreau să văd top 10 clienți după LTV, ca să îi prioritizez pentru oferte speciale.
- Ca director, vreau să văd top cursuri după venit, ca să știu pe ce să investesc marketing.

## Acceptance criteria
- [ ] API `GET /api/analytics/cohort-retention` — returnează {cohortId, cohortName, retentionRate, currentStudents, previousStudents}.
- [ ] API `GET /api/analytics/student-ltv` — returnează top 10 studenți după totalul plăților, {studentId, name, totalPaidCents}.
- [ ] API `GET /api/analytics/top-courses` — returnează cursuri după venituri luna curentă, {courseId, courseName, revenueCents}.
- [ ] AnalyticsPage.tsx: 3 noi carduri cu grafice simple (bar chart sau listă ordonată).
- [ ] Design system, dark mode, zero hex.

## Files to create/modify
- `server/routes/analytics.ts` (extindere)
- `src/pages/app/AnalyticsPage.tsx` (extindere)
- `src/__tests__/gap016-analytics.test.ts`

## Tests
- **T-GAP-016-1** [blocant] Given GET /api/analytics/cohort-retention, Then 200 cu array de cohort retention objects
- **T-GAP-016-2** [blocant] Given GET /api/analytics/student-ltv, Then 200 cu max 10 studenți ordonați descrescător
- **T-GAP-016-3** [blocant] Given GET /api/analytics/top-courses, Then 200 cu cursuri ordonate după venit
- **T-GAP-016-4** [blocant] Given AnalyticsPage render, Then fără crash cu noile 3 carduri
- **T-GAP-016-5** [normal] Given tenant fără date, When GET analytics endpoints, Then 200 cu arrays goale

## Definition of Done
- Build verde. Teste blocante trec. (Nu e migrare dacă nu e nevoie schema nouă.)
- Reviewer APPROVED. Integration-architect CONNECTED. Personas: manager BUY, student OK.

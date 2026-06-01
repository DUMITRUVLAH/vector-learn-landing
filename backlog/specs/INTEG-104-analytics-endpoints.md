---
id: INTEG-104
title: "Integrare: 4 endpoint-uri analytics lipsă (/kpi, /revenue-over-time, /revenue-by-course, /student-ltv)"
milestone: INTEG
phase: 1
status: in_progress
depends_on: [INTEG-102, INTEG-103]
slug: analytics-endpoints
---

## Goal

Adaugă 4 endpoint-uri analytics lipsă care conectează modulele financiare (payments, courses, students).
Aceste endpoint-uri sunt cerute de dashboard-ul de rapoarte (REP-301..304) dar nu existau
în analytics.ts, forțând UI-ul să calculeze pe client sau să afișeze date incomplete.

## In scope

- GET /api/analytics/kpi — KPI-uri sumare: revenue luna curentă, students activi, rata conversie.
- GET /api/analytics/revenue-over-time — serii temporale revnue zilnic/lunar (query param: granularity=day|month, months=1..12).
- GET /api/analytics/revenue-by-course — revenue total per curs (din payments.course_id JOIN courses).
- GET /api/analytics/student-ltv — LTV mediu per student (total plăți paid / nr studenți activi).
- Niciun endpoint nu necesită migrare (folosesc tabele existente: payments, courses, students).
- Tests: T-INTEG-104-1..5 verzi.

## Out of scope

- UI charts (acoperit de REP-30x).
- Revenue per branch (INTEG-faza-2).

## User stories

- **US-1**: Ca manager, vreau KPI-uri la o privire pe dashboard pentru a lua decizii rapide.
- **US-2**: Ca manager, vreau să văd evoluția venitului lunar ca să detectez trenduri.
- **US-3**: Ca manager, vreau să știu care curs aduce cel mai mult venit.
- **US-4**: Ca director, vreau LTV-ul mediu per student pentru a evalua profitabilitatea.

## Acceptance criteria

- [ ] AC1: GET /api/analytics/kpi → { revenueMtdCents, activeStudents, conversionRate, overdueCount }.
- [ ] AC2: GET /api/analytics/revenue-over-time?months=3 → { series: [{period, amountCents}] }.
- [ ] AC3: GET /api/analytics/revenue-by-course → { courses: [{courseId, courseName, totalCents}] }.
- [ ] AC4: GET /api/analytics/student-ltv → { avgLtvCents, totalRevenueCents, activeStudents }.
- [ ] AC5: Toate endpoint-urile returnează 200 cu JSON valid; tenant-safe; zero any; fără .execute().rows.
- [ ] AC6: Endpoint-urile sunt înregistrate în app.ts (sau în analyticsRoutes deja montat).

## Tests

- **T-INTEG-104-1** `[blocant]` GET /api/analytics/kpi → shape corect (revenueMtdCents, activeStudents, conversionRate, overdueCount).
- **T-INTEG-104-2** `[blocant]` GET /api/analytics/revenue-over-time → { series: Array<{period, amountCents}> }.
- **T-INTEG-104-3** `[blocant]` GET /api/analytics/revenue-by-course → { courses: Array<{courseId, courseName, totalCents}> }.
- **T-INTEG-104-4** `[blocant]` GET /api/analytics/student-ltv → { avgLtvCents, totalRevenueCents, activeStudents }.
- **T-INTEG-104-5** Calculele sunt corecte: revenue-by-course grupează payments pe courseId și sumează amountCents.

## Definition of Done

- [ ] AC1-6 bifate; T-INTEG-104-1..5 verzi; build+typecheck+lint+test verzi
- [ ] Fără migrare necesară (tabele existente).

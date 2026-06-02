---
id: INTEG-104
title: Implementează 4 endpoint-uri analytics lipsă — KPI, revenue, LTV
milestone: INTEG
phase: "1"
branch: feat/INTEG-faza-1-conectivitate-module
status: pending
attempts: 0
depends_on: [INTEG-102]
---

## Goal

Patru pagini de analytics (KpiDashboardPage, RevenueChartsPage, StudentRetentionPage) apelează endpoint-uri care NU există pe server. Fiecare pagină afișează permanent stare de eroare. Implementăm toate 4 endpoint-urile cu date reale din DB.

## Context — ce există acum

`server/routes/analytics.ts` are doar endpoint-uri CRM (`/crm/funnel`, `/crm/roas`, etc.).  
Clientul frontend la `src/lib/api/analytics.ts` apelează:
- `GET /api/analytics/kpi?period=month|quarter|year` → `KpiDashboardPage.tsx`
- `GET /api/analytics/revenue-over-time?months=N` → `RevenueChartsPage.tsx`
- `GET /api/analytics/revenue-by-course` → `RevenueChartsPage.tsx`
- `GET /api/analytics/student-ltv?limit=N` → `StudentRetentionPage.tsx`

## User stories

- Ca director, vreau să văd KPI-urile cheie (elevi activi, MRR, rata de retenție, leads noi) pe dashboard, pentru că am o imagine rapidă a academiei.
- Ca director financiar, vreau un grafic de revenue în timp (lunile trecute), pentru că identific tendințele.
- Ca manager de cursuri, vreau să știu ce revenue a generat fiecare curs, pentru că știu care sunt cursurile cele mai valoroase.
- Ca director, vreau să văd LTV-ul mediu pe student (total plăți / student), pentru că înțeleg valoarea pe termen lung.

## Acceptance criteria

### 1. `GET /api/analytics/kpi?period=month|quarter|year`

Returnează:
```json
{
  "activeStudents": 120,
  "activeStudentsChange": 5.2,
  "mrr": 48000,
  "mrrChange": -2.1,
  "newLeads": 34,
  "newLeadsChange": 12.0,
  "retentionRate": 87.5,
  "retentionRateChange": 1.5
}
```
- `activeStudents` = count(`students` WHERE `status = 'active'` AND în perioada selectată)
- `mrr` = sum(`payments.amountCents`) pentru luna curentă / 100
- `newLeads` = count(`leads` create în perioadă)
- `retentionRate` = (elevi activi la final / elevi activi la start) * 100
- `*Change` = comparație cu perioada anterioară (%)

### 2. `GET /api/analytics/revenue-over-time?months=N`

Returnează array de N luni:
```json
[
  { "month": "2026-01", "revenue": 42000, "payments": 38 },
  { "month": "2026-02", "revenue": 45000, "payments": 41 }
]
```
- Grupare pe `DATE_TRUNC('month', payments.paid_at)`
- Sum `amountCents` / 100

### 3. `GET /api/analytics/revenue-by-course`

Returnează:
```json
[
  { "courseId": "uuid", "courseName": "Engleză B2", "revenue": 15000, "students": 12 },
  ...
]
```
- Join `payments → courses` via `payments.courseId` (adăugat de INTEG-102)
- Fallback dacă `courseId` null: grup separat "Necategorizat"
- Sortat descrescător după revenue

### 4. `GET /api/analytics/student-ltv?limit=N`

Returnează:
```json
{
  "averageLtv": 2400,
  "medianLtv": 1800,
  "topStudents": [
    { "studentId": "uuid", "studentName": "Ion P.", "totalPaid": 7200, "months": 14 }
  ]
}
```
- `totalPaid` = sum(`payments.amountCents`) per student / 100
- `months` = luni de la prima plată la ultima
- `topStudents` = primii `limit` studenți după `totalPaid`

### 5. Branch filter

Toate 4 endpoint-urile aplică branch filter dacă user-ul are `branchScope`.

### 6. Paginile nu mai afișează eroare

`KpiDashboardPage`, `RevenueChartsPage`, `StudentRetentionPage` — toate se încarcă cu date reale fără erori de 404.

## Files touched

- `server/routes/analytics.ts` — adaugă cele 4 handler-e noi
- `src/pages/app/KpiDashboardPage.tsx` — verifică că tipurile se potrivesc
- `src/pages/app/RevenueChartsPage.tsx` — verifică că tipurile se potrivesc
- `src/pages/app/StudentRetentionPage.tsx` — verifică că tipurile se potrivesc
- `src/lib/api/analytics.ts` — verifică/aliniază tipurile cu response-ul real

## Tests

- Unit: `/api/analytics/kpi` returnează structura corectă
- Unit: `/api/analytics/revenue-over-time` returnează N luni
- Unit: `/api/analytics/revenue-by-course` returnează cursuri cu revenue
- Unit: `/api/analytics/student-ltv` returnează LTV stats
- Integration: toate 4 endpoint-uri returnează 200 cu tenant valid

## DoD

- [ ] Toate 4 endpoint-uri implementate
- [ ] Paginile se încarcă fără erori 404
- [ ] Branch filter aplicat
- [ ] TypeScript strict — zero `any`
- [ ] Tests verzi

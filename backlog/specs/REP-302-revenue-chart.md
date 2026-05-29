---
id: REP-302
title: "Revenue over time: line chart MRR lunar + breakdown per disciplină"
milestone: REP
phase: "2 — Revenue Charts"
priority: P0
slug: revenue-chart
depends_on: [REP-301]
status: pending
---

# REP-302 — Revenue chart lunar

## Goal

Tab suplimentar în `/app/analytics` cu line chart (recharts) al veniturilor lunare pe ultimele
12 luni, plus un bar chart de breakdown revenue per disciplină (curs). Fără bibiloteci externe
noi — recharts e deja în bundle sau se adaugă.

## In scope

- **API `GET /api/analytics/revenue-over-time`**:
  - Query: `?months=12` (default 12)
  - Returnează: array de `{ month: "2026-01", totalCents: number, newStudents: number }`
  - Calculat din payments.paid_at + amount_cents unde status=paid
  - Tenant-scoped
- **API `GET /api/analytics/revenue-by-course`**:
  - Returnează: `{ items: { courseName: string, totalCents: number, studentCount: number }[] }`
  - Join payments → student_lessons → lessons → courses
  - Top 10 cursuri după revenue, ultimele 12 luni
- **Tab „Revenue"** în AnalyticsPage:
  - Line chart: axa X = luni, axa Y = RON/€, tooltip cu sumă
  - Bar chart: revenue per disciplină (top 10)
  - Refolosește recharts dacă deja instalat, altfel adăugat în package.json
- Dark mode, responsive

## Out of scope

- Forecast (predicție)
- Breakdown per filială
- Export

## Data / API

### GET /api/analytics/revenue-over-time
Response: `{ months: { month: "YYYY-MM", totalCents: number, newStudents: number }[] }`

### GET /api/analytics/revenue-by-course
Response: `{ items: { courseName: string, totalCents: number, studentCount: number }[] }`

## Acceptance criteria

- [ ] GET /api/analytics/revenue-over-time → 200 cu array de luni
- [ ] GET /api/analytics/revenue-by-course → 200 cu array de cursuri
- [ ] Line chart renderează cu datele
- [ ] Bar chart renderează cu datele
- [ ] Dark mode

## Tests

1. [blocant] GET /api/analytics/revenue-over-time → 200, array
2. [blocant] GET /api/analytics/revenue-by-course → 200, array
3. [normal] Line chart renderează fără crash

## DoD

Standard.

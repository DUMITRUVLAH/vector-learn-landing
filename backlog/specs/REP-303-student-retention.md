---
id: REP-303
title: "Student retention: LTV per elev + top 10 + attendance rate"
milestone: REP
phase: "3 — Student Analytics"
priority: P0
slug: student-retention
depends_on: [REP-301]
status: pending
---

# REP-303 — Student retention analytics

## Goal

Tab „Elevi" în AnalyticsPage cu:
- Top 10 elevi după LTV (lifetime value = sum plăți paid)
- Attendance rate medie per elev (prezențe / total lecții)
- Tabel sortabil cu studenți: LTV, plăți, lecții, ultima prezență

## In scope

- **API `GET /api/analytics/student-ltv`**:
  - Returnează: `{ items: { studentId, fullName, ltvCents, paymentCount, lessonsAttended, lastLessonAt }[] }`
  - ltvCents = sum(payments.amount_cents WHERE status=paid)
  - lessonsAttended = count(student_lessons WHERE status=present)
  - Ordered by ltvCents DESC, limit 50
  - Tenant-scoped
- **Tab „Elevi"** în AnalyticsPage:
  - Tabel: Nume, LTV (€), Lecții prezent, Ultima lecție, badge hot/warm/cold
  - Sortare client-side pe coloane
  - Search box (filtrare după nume)
  - Dark mode, responsive

## Out of scope

- Cohort matrix (heatmap)
- Churn prediction model
- Export

## Data / API

### GET /api/analytics/student-ltv
Response: `{ items: { studentId: string, fullName: string, ltvCents: number, paymentCount: number, lessonsAttended: number, lastLessonAt: string | null }[] }`

## Acceptance criteria

- [ ] GET /api/analytics/student-ltv → 200, sortate desc
- [ ] Tabel cu sort pe LTV funcțional
- [ ] Search după nume funcțional
- [ ] Dark mode

## Tests

1. [blocant] GET /api/analytics/student-ltv → 200
2. [normal] Tabel sortare LTV desc
3. [normal] Search filtrează după nume

## DoD

Standard.

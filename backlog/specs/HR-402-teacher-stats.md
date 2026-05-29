---
id: HR-402
title: "Stats profesor: ore predate, rata prezență elevi, venituri generate"
milestone: HR
phase: "2 — Teacher Stats"
priority: P0
slug: teacher-stats
depends_on: [HR-401]
status: pending
---

# HR-402 — Teacher stats dashboard

## Goal

Cartonaș extins `/app/teachers/:id` sau tab în `/app/teachers` cu statistici per profesor:
ore predate în ultima lună/trimestru, rata de prezență a elevilor la lecțiile lui, venituri
generate (lecții × tarif), top 5 cursuri predate.

## In scope

- **API `GET /api/hr/teachers/:id/stats`**:
  - Query: `?period=30d|90d|12m`
  - Returns:
    - `lessonsCompleted`: count lessons completed în perioadă
    - `hoursCompleted`: sum duration_minutes/60
    - `studentAttendanceRate`: present_count / total_student_lessons %
    - `revenueCents`: lessonsCompleted × ratePerHour × hoursCompleted
    - `topCourses`: [{ courseName, lessonCount }] top 5
- **UI tab „Stats"** în TeachersPage (sau link din tabel → drawer):
  - 4 stat cards: lecții, ore, prezență%, venit
  - Top courses list
  - Period toggle

## Out of scope

- Comparison între profesori
- Rating sistem

## Acceptance criteria

- [ ] GET /api/hr/teachers/:id/stats → 200 cu toate câmpurile
- [ ] Stats cards afișate cu valori
- [ ] Period toggle funcțional

## Tests

1. [blocant] GET /api/hr/teachers/:id/stats → 200
2. [normal] UI stats cards renderează

## DoD

Standard.

---
id: SCHED-503
title: "Marcare prezență la lecție — lista elevi + checkbox + lock 24h"
milestone: SCHED
phase: "3 — Attendance"
priority: P0
slug: attendance
depends_on: [SCHED-501]
status: pending
---

# SCHED-503 — Marcare prezență

## Goal

Profesor/Manager marchează prezența elevilor la o lecție completă. Lock-ul
de 24h previne editare tardivă (override permis pentru manager).

## In scope

- `GET /api/lessons/:id/students`: lista elevilor înscriși la lecție (din student_lessons)
- `PATCH /api/lessons/:id/students/:studentId/attendance`:
  body `{ attendanceStatus: present|absent|late|excused }` + check 24h lock
- Dacă `lessons.status = scheduled` și `scheduledAt < now()` → marcare permisă
- Lock: dacă `lesson.scheduledAt < now() - 24h` și `markedBy != null` → 403 locked (override pt manager)
- UI în SchedulePage lesson detail: tabel elevi + dropdown status per elev

## Out of scope

- Recovery lesson automation (US-SCH-09)
- Push notification la final lecție

## Acceptance criteria

- [ ] GET /api/lessons/:id/students → 200
- [ ] PATCH attendance → status actualizat cu markedBy + markedAt
- [ ] Lock 24h → 403 pentru non-manager
- [ ] UI tabel elevi cu status dropdown

## Tests

1. [blocant] GET /api/lessons/:id/students → 200
2. [blocant] PATCH attendance → present saved
3. [blocant] Lock 24h → 403
4. [normal] UI dropdown status per elev

## DoD

Standard.

---
id: SCHED-504
title: "Export iCal /api/calendar/teacher/:id.ics — format iCalendar standard"
milestone: SCHED
phase: "4 — iCal"
priority: P1
slug: ical
depends_on: [SCHED-501]
status: pending
---

# SCHED-504 — Export iCal

## Goal

Endpoint public (token-auth) care returnează orarul unui profesor în format iCalendar.
Poate fi importat în Google Calendar, Outlook, Apple Calendar.

## In scope

- `GET /api/calendar/teacher/:id.ics?token=JWT_READ_ONLY`
  - Token: JWT cu `sub=teacherId`, `tenantId`, `exp=90d`, semnat cu secret
  - Returnează Content-Type: text/calendar
  - iCal: VCALENDAR cu VEVENT per lecție (scheduledAt, duration, summary=course name, location=room)
- Endpoint `POST /api/teachers/:id/calendar-token`: generează tokenul și returnează URL-ul
- UI în SchedulePage sau TeacherStatsPage: buton „Copiază link Calendar"

## Out of scope

- Auto-refresh la 15 min (browser caching)
- OAuth Google/Zoom

## Acceptance criteria

- [ ] GET /api/calendar/teacher/:id.ics → 200, Content-Type text/calendar
- [ ] iCal parseable (VCALENDAR valid)
- [ ] Token expirat → 401
- [ ] UI copiază URL în clipboard

## Tests

1. [blocant] GET /api/calendar/teacher/:id.ics → 200, text/calendar
2. [blocant] iCal conține VCALENDAR header
3. [normal] UI buton „Copiază link Calendar"

## DoD

Standard.

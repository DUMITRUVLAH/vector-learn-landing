# SCHED-504 Integration Report

**Verdict: CONNECTED**

## DB wiring
- Queries `teachers` → `users` (for name) → `lessons` → `courses` (for name/level)
- All tenant-scoped via `payload.tenantId` extracted from verified token
- No raw `.execute().rows` — query builder throughout

## Route architecture
- `POST /api/teachers/:id/calendar-token` — auth-required (requireAuth), generates HMAC token
- `GET /api/calendar/teacher/:id.ics` — public (no cookie), token in query param
- Route ordering: calendarIcsRoutes mounted before tagRoutes to avoid requireAuth catch-all

## iCal output
- Valid VCALENDAR wrapper (BEGIN/END, VERSION, PRODID, CALSCALE, METHOD)
- VEVENT per lesson: UID, DTSTAMP, DTSTART, DTEND (scheduledAt + durationMinutes), SUMMARY (course name + level), DESCRIPTION (notes if present)
- RFC 5545 compliant: CRLF line endings, 75-char line folding, text escaping
- Returns lessons from past 30 days to future (relevant window for calendar apps)

## Token security
- HMAC-SHA256 signed: header.payload.signature (3 parts)
- Payload: { teacherId, tenantId, exp (90 days) }
- teacherId in URL verified against token.teacherId to prevent cross-teacher reuse
- Expired tokens return 401

## Smoke test results
- POST /api/teachers/:id/calendar-token → 200 with { token, url, expiresInDays: 90 } ✓
- GET /api/calendar/teacher/:id.ics → 200, Content-Type: text/calendar ✓
- iCal begins with BEGIN:VCALENDAR, contains VEVENT per lesson ✓
- Invalid token → 401 ✓
- Missing token → 401 ✓
- 29 unit tests green (ical.test.ts)

# SCHED-504 Code Review — Cycle 1

**Verdict: APPROVED**

## Design system / a11y
- No hardcoded hex colors — semantic tokens throughout (bg-success/10, text-success, border-success/40)
- "Copiaza link Calendar" button has aria-label with teacher name
- Loading state (Loader2), copied state (Check icon), idle state (Calendar icon) — clear feedback cycle
- Disabled during generation with opacity-50

## Dark mode
- All tokens semantic — dark mode works automatically

## Security / token
- HMAC-SHA256 signed tokens (node:crypto — no external JWT dep)
- Token verified server-side before any DB query
- Teacher ID in token is compared with URL param — prevents token reuse across teachers
- `CALENDAR_TOKEN_SECRET` env var (dev fallback provided)

## Route ordering fix
- `calendarIcsRoutes` mounted BEFORE `tagRoutes` (which has `use("/*", requireAuth)`)
- Public endpoint correctly bypasses cookie auth

## Integration
- `GET /api/calendar/teacher/:id.ics` — public, token-auth, returns 30-day window lessons
- `POST /api/teachers/:id/calendar-token` — auth-required, tenant-scoped teacher check
- iCal RFC 5545 compliant: VCALENDAR + VEVENTs, CRLF line endings, 75-char line folding

## Dead code
- None

## Issues
- None

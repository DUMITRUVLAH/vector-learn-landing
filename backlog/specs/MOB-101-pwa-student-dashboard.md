---
id: MOB-101
title: PWA setup + student dashboard
milestone: MOB
phase: "1"
status: pending
priority: P0
depends_on: [MVP-004, MVP-005]
spec: backlog/specs/MOB-101-pwa-student-dashboard.md
---

## Goal

Give students a mobile-first experience: install Vector Learn as a PWA (web app icon on
home screen, offline cache), then land on a `/m/dashboard` student-role page showing the
next lesson countdown, quick-action buttons (Orar / Teme / Plăți), and a welcome card with
the student's name + enrolled course.

---

## User stories

- **Ca Elev**, vreau să instalez Vector Learn pe iPhone fără App Store, pentru că o accesez
  ca pe o aplicație nativă.
- **Ca Elev**, vreau să văd la deschidere următoarea lecție + countdown, pentru că sunt
  pregătit la timp.
- **Ca Elev**, vreau quick-actions vizibile (Orar, Teme, Plăți), pentru că navighez cu un
  singur tap fără să caut în meniu.
- **Ca Director**, vreau elevii să aibă o experiență PWA branded, pentru că cresc loialitatea
  și frecvența accesului.

---

## Acceptance criteria

1. `public/manifest.json` present with `name`, `short_name`, `icons` (192, 512 png),
   `theme_color`, `background_color`, `display: standalone`.
2. `public/sw.js` service worker registered in `main.tsx` — caches the app shell (index.html,
   main JS, main CSS). Offline fallback returns cached index.html.
3. Route `/m/dashboard` exists, authenticated, redirects non-students to `/app`.
4. Student dashboard shows:
   - Welcome card: "Bună ziua, {name}!"
   - Next lesson card: subject, teacher, room, starts in `<duration>`. If no future lesson → "Nicio lecție programată".
   - Three quick-action buttons: Orar (`/m/schedule`), Teme (`/m/homework`), Plăți (`/m/invoices`).
5. Page is fully responsive, passes axe with 0 critical/serious violations, works in dark mode.
6. Unit test: student dashboard renders without crash, shows "Bună ziua" text.
7. Migration: no schema changes (uses existing `lessons`, `students` tables).

---

## Files (create / modify)

- `public/manifest.json` — new
- `public/sw.js` — new service worker
- `src/main.tsx` — register SW
- `src/pages/app/mobile/StudentDashboardPage.tsx` — new
- `src/pages/app/mobile/StudentDashboardPage.test.tsx` — new
- `server/routes/mobile.ts` — new: GET `/api/m/dashboard` → next lesson + student info
- `server/routes.ts` — mount mobile router
- `src/App.tsx` or router — add `/m/dashboard` route (protected, student role)

---

## Tests

- **T-MOB-101-1** `[blocant]` Given server running, When POST `/api/auth/login` then GET
  `/api/m/dashboard` (student token), Then 200 with `{ student, nextLesson }`.
- **T-MOB-101-2** `[blocant]` Given `StudentDashboardPage` rendered with mock data, When component mounts,
  Then renders "Bună ziua" and next lesson card without crash.
- **T-MOB-101-3** `[blocant]` Given manifest.json present, When checked, Then has `display: standalone`
  and `icons` array with at least 1 entry.
- **T-MOB-101-4** `[normal]` Given student with no future lessons, When dashboard loads, Then
  shows "Nicio lecție programată" empty state.
- **T-MOB-101-5** `[normal]` Given dark mode applied, When StudentDashboardPage renders, Then
  no hardcoded hex color visible (uses semantic tokens).

---

## Definition of Done

- [ ] manifest.json + sw.js committed and reachable at `/manifest.json`, `/sw.js`
- [ ] `/m/dashboard` route works for authenticated students
- [ ] API endpoint `/api/m/dashboard` returns 200 with correct shape
- [ ] All T-MOB-101-* tests green
- [ ] Reviewer APPROVED + integration-architect CONNECTED
- [ ] Persona reports saved
- [ ] PR open on `feat/MOB-faza-1-student-pwa`

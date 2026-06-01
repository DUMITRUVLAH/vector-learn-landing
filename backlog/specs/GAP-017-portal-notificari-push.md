---
id: GAP-017
title: Notificări push pentru portal — lecție mâine, sold scadent, pachet aproape epuizat
milestone: GAP
phase: "3"
branch: feat/GAP-faza-3-portal-notificari
depends_on: [GAP-010]
---

## Goal
Extinde portalul student (GAP-010) cu un sistem de notificări proactive:
- SMS/email automat "Lecție mâine la ora X cu profesorul Y"
- SMS/email automat "Ai sold datorat de Z RON — plătește la link"
- SMS/email automat "Pachetul de ore e pe terminate (N ore rămase)"
Aceste notificări se trimit prin notification_queue existent (COMM-205) și sunt
configurabile de admin (on/off per tip, per student).

## User stories
- Ca student, vreau să primesc un SMS cu o zi înainte de fiecare lecție, ca să nu uit.
- Ca părinte, vreau să primesc un email când soldul depășește 200 RON datorat, ca să plătesc prompt.
- Ca student cu pachet, vreau să primesc un alert când mai am 2 ore, ca să cumpăr din timp.
- Ca director, vreau să pot activa/dezactiva fiecare tip de notificare per student, ca să nu deranjez clienții care nu vor notificări.

## Acceptance criteria
- [ ] Schema `portal_notification_prefs` cu: id, tenantId, studentId, lessonReminder (bool, default true), debtAlert (bool, default true), packageLowAlert (bool, default true), reminderHoursBefore (int, default 24), debtThresholdCents (int, default 20000), packageLowThreshold (int, default 2).
- [ ] API `GET /api/portal/:token/prefs` — student poate vedea preferințele proprii.
- [ ] API `PATCH /api/portal/:token/prefs` — student poate modifica (opt-out).
- [ ] API `PATCH /api/students/:id/portal-prefs` (admin) — admin poate configura per student.
- [ ] Job/endpoint `POST /api/portal/send-reminders` (internal/cron) — scanează lecțiile din ziua următoare și trimite reminder în notification_queue.
- [ ] Job/endpoint `POST /api/portal/send-debt-alerts` (internal/cron) — scanează solduri > threshold și trimite alert.
- [ ] Job/endpoint `POST /api/portal/send-package-alerts` (internal/cron) — scanează pachete cu credite ≤ threshold.
- [ ] Pagina portal (`StudentPortalPage.tsx`) afișează un toggle "Notificări lecții" și "Notificări sold" cu starea curentă și permite opt-out.
- [ ] Design: design system Vector 365, dark mode, zero hex hardcodat.

## Files to create/modify
- `server/db/schema/portalNotificationPrefs.ts` — tabel nou
- `server/db/schema/index.ts` — export nou
- `drizzle/0030_gap017_portal_notif_prefs.sql` — migrare nouă (prefix 0030)
- `server/routes/portalNotifs.ts` — route handler
- `server/app.ts` — mount routes
- `src/pages/portal/StudentPortalPage.tsx` — adaugă secțiune preferințe notificări
- `src/__tests__/gap017-portal-notifs.test.ts` — unit tests

## Tests
- **T-GAP-017-1** [blocant] Given preferințe default, When GET /api/portal/:token/prefs, Then 200 cu lessonReminder:true
- **T-GAP-017-2** [blocant] Given student cu lecție mâine și lessonReminder:true, When POST /api/portal/send-reminders, Then un item adăugat în notification_queue
- **T-GAP-017-3** [blocant] Given student cu sold > threshold și debtAlert:true, When POST /api/portal/send-debt-alerts, Then notificare adăugată
- **T-GAP-017-4** [blocant] Given student cu debtAlert:false, When POST /api/portal/send-debt-alerts, Then nici o notificare adăugată pentru el
- **T-GAP-017-5** [blocant] Given PATCH /api/portal/:token/prefs cu {lessonReminder:false}, When GET prefs ulterior, Then lessonReminder:false
- **T-GAP-017-6** [normal] Given pagina portal cu toggle notificări, When toggle e dezactivat, Then UI reflectă starea off

## Definition of Done
- Migrare 0030 generată și commitată; db:reset + db:seed trec.
- Build + typecheck + lint verde.
- Toate testele blocante trec.
- Reviewer APPROVED.
- Integration-architect CONNECTED (se folosește notification_queue din COMM-205).
- Personas: manager — BUY/MAYBE; student — OK/LOVES.

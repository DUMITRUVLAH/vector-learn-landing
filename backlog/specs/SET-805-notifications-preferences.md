---
id: SET-805
title: "Notification preferences + system health page"
milestone: SET
phase: "1 — Settings Foundation"
priority: P1
slug: notifications-preferences
depends_on: [SET-801]
status: pending
---

# SET-805 — Notification preferences per user + /status public page

## Goal

Each user controls which notifications they receive (payment alerts, lead assigned,
attendance missing, system announcements). A public `/status` page shows uptime and
recent incidents so users can self-diagnose issues without calling support.

## User stories

- Ca User, vreau să optez/dezoptez din categorii de notificări (plăți, lead-uri, orar,
  sistem), pentru că nu vreau să fiu spam-uit cu alerte irelevante.
- Ca Manager, vreau să activez alertele de plăți ratate și să dezactivez pe cele de
  sistem, pentru că am prioritățile mele.
- Ca User, vreau să accesez vectorlearn.io/status și să văd dacă serviciul e operațional,
  pentru că uneori nu știu dacă problema e la mine sau la platformă.
- Ca Owner, vreau să configurez canalele de notificare (email, push, in-app) separat pe
  categorie, pentru că nu vreau email pentru fiecare acțiune banală.

## Acceptance criteria

- [ ] DB: tabel `notification_preferences` cu `(id, user_id, category, email_enabled,
      push_enabled, in_app_enabled)`; categorii: `payments`, `leads`, `attendance`,
      `system`, `marketing`; câte un rând per user/categorie; migrare comisă
- [ ] `GET /api/settings/notifications` — lista preferințelor pentru userul curent
- [ ] `PATCH /api/settings/notifications` — body array `[{ category, emailEnabled,
      inAppEnabled }]`; upsert; răspuns 200 cu preferințele actualizate
- [ ] Pagina `/app/settings/notifications`:
      - Tabel cu categorii pe rânduri, canale (Email / In-app) pe coloane
      - Toggle-uri per celulă
      - Buton "Salvează preferințele"
      - Descriere per categorie (ce tipuri de alertă include)
- [ ] Pagina publică `/status` (fără autentificare):
      - Status general: Operational / Degraded / Down (citit din variabilă de env sau
        endpoint `/api/health`)
      - Uptime: "99.9% în ultimele 90 de zile" (valori hardcodate demo-ready)
      - Componente monitorizate: API, DB, File Storage, Email Delivery — fiecare cu
        status badge
      - Secțiune "Incidente recente" (array hardcodat, max 3 intrări)
- [ ] Link `/status` în footer-ul landing page și în AppShell help menu
- [ ] Preferințele salvate sunt respectate de COMM-205 (notification_queue skip dacă
      category disabled) — adaugă check în `createNotification` helper

## Files

### New files
- `server/db/schema/notification_preferences.ts`
- `server/routes/settings/notifications.ts`
- `src/pages/settings/NotificationsPage.tsx`
- `src/pages/StatusPage.tsx` — pagina publică /status
- `src/__tests__/settings/notifications.test.ts`

### Modified files
- `server/db/schema/index.ts` — export notification_preferences
- `server/index.ts` — mount router notificări
- `src/App.tsx` — rute settings/notifications + /status
- `server/routes/notifications.ts` — verificare preferință înainte de inserare în queue

## Tests

- **T-SET-805-1** [blocant] Given: migration rulată, When: db:reset && db:seed, Then: succes
- **T-SET-805-2** [blocant] Given: admin logat, When: PATCH /api/settings/notifications cu
  `[{ category: "payments", emailEnabled: false, inAppEnabled: true }]`, Then: 200 + salvat
- **T-SET-805-3** [blocant] Given: server pornit, When: GET /api/settings/notifications (auth),
  Then: 200 cu array de preferințe
- **T-SET-805-4** [blocant] Given: /status page, When: GET /status (fără auth), Then: 200 HTML
  cu text "Operational" sau echivalent
- **T-SET-805-5** [normal] Given: NotificationsPage randată, When: user togglează Email pe
  category "leads", Then: starea toggle se actualizează vizual
- **T-SET-805-6** [normal] Given: preferință `payments.inAppEnabled = false`, When: se
  creează o notificare de tip payments, Then: nu e inserată în notification_queue

## Definition of Done

- [ ] Build + typecheck + lint verzi
- [ ] Toate testele T-SET-805-x trec
- [ ] Migration comisă (`drizzle/0038_set805_notification_preferences.sql`)
- [ ] `db:reset && db:seed` succes
- [ ] Reviewer APPROVED
- [ ] PR pe `feat/SET-faza-1-settings`

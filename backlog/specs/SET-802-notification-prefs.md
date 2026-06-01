---
id: SET-802
title: Preferințe notificări — opt-in/out per categorie
milestone: SET
phase: "1"
branch: feat/SET-faza-1-settings
status: pending
attempts: 0
depends_on: [SET-801]
---

## Goal

Fiecare user poate configura ce tipuri de notificări primește (sistem, marketing, alerte).
Preferințele sunt stocate per user în tabelul `notification_preferences`. Sistemul de
notificări (COMM-205) consultă preferințele înainte de a trimite.

## User stories

- Ca User, vreau să dezactivez notificările de marketing, pentru că primesc prea multe.
- Ca Teacher, vreau să primesc alerte de lecție anulată, dar nu alte notificări, pentru că nu vreau să fiu distras.
- Ca Admin, vreau să forțez notificările critice de sistem indiferent de preferințe, pentru că outage-urile trebuie să ajungă la toți.
- Ca User, vreau să schimb preferințele din setări în maximum 3 clicuri, pentru că e o acțiune rară dar trebuie să fie ușoară.

## Acceptance criteria

1. **Tabel `notification_preferences`**: `id, user_id (FK), category (enum: system|marketing|alerts|lessons), enabled (bool), updated_at`. Migrare comisă.

2. **API `GET /api/settings/notifications`** — returnează preferințele userului curent (toate categoriile, defaulturi `true`).

3. **API `PUT /api/settings/notifications`** — actualizează preferințele în batch: `{ system: true, marketing: false, alerts: true, lessons: true }`. `system` nu poate fi setat pe `false` (categoria critică).

4. **UI `/app/settings/notifications`**: toggle-uri per categorie cu etichete descriptive. Salvare automată la toggle (debounced 500ms). Toast "Salvat" la succes.

5. **Integrare COMM-205**: `notification_queue` worker verifică preferința userului înainte de push (skip dacă `enabled = false` pentru acea categorie).

## Files

### New
- `server/db/schema/notificationPreferences.ts` — tabel
- `server/routes/notificationSettings.ts` — GET + PUT
- `src/pages/app/settings/NotificationPrefsPage.tsx` — UI
- `src/__tests__/settings/notification-prefs.test.tsx`

### Modified
- `server/db/schema/index.ts` — export notificationPreferences
- `server/app.ts` — mount notificationSettings routes
- `src/App.tsx` — route /app/settings/notifications
- `src/components/app/AppShell.tsx` — link în settings section

## Tests

- **T-SET-802-1** [blocant] Migration: notification_preferences table exists after db:reset.
- **T-SET-802-2** [blocant] PUT /api/settings/notifications returns 400 if system=false is attempted.
- **T-SET-802-3** [blocant] NotificationPrefsPage renders toggles without crash.
- **T-SET-802-4** [normal] GET /api/settings/notifications returns all 4 categories with defaults=true.
- **T-SET-802-5** [normal] Setting marketing=false persists across GET calls.

## DoD

- [ ] Migration committed
- [ ] Build + typecheck + lint green
- [ ] Unit tests green
- [ ] Reviewer APPROVED
- [ ] PR on `feat/SET-faza-1-settings`

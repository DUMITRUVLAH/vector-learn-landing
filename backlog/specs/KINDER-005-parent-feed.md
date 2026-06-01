---
id: KINDER-005
title: Parent app feed (photos/updates) + messaging
milestone: KINDER
phase: "1"
branch: feat/KINDER-faza-1-checkin-diary-ratio
status: pending
attempts: 0
depends_on: [KINDER-001, KINDER-002]
---

## Goal

Brightwheel și Famly câștigă grădinițele prin engagementul parental — părintele vede în timp
real ce face copilul la grădiniță: check-in confirmat, jurnal de activități, fotografii, mesaje
de la educatoare. Adăugăm o pagină "Feed Parental" în aplicație care agregă evenimentele
zilei unui copil (din `checkin_log` + `daily_report_events`) și permite un canal de mesagerie
simplu grădiniță↔familie.

## User stories

- Ca părinte, vreau să văd pe telefon că copilul meu a ajuns la grădiniță și ce a mâncat la prânz, pentru că astfel am liniștea că e bine.
- Ca educatoare, vreau să trimit un mesaj rapid unui pericol (febră, incident mic) direct la părintele copilului, fără să schimb aplicația.
- Ca manager, vreau ca feedul să arate îngrijit și să includă fotografia zilei, pentru că părinții recomandă grădinița prietenilor când sunt impresionați de transparență.
- Ca părinte, vreau să pot răspunde la mesajele educatoarei din același feed, pentru că nu vreau să folosesc WhatsApp pentru comunicarea cu grădinița.

## Acceptance criteria

1. Schema `kinder_messages`:
   - `kinder_messages` (id, tenant_id, student_id, sender_user_id UUID → users.id, direction ENUM('staff_to_parent','parent_to_staff'), body TEXT NOT NULL, sent_at TIMESTAMP WITH TIME ZONE, read_at TIMESTAMP WITH TIME ZONE, created_at)
   - No new tables needed for the feed itself — aggregates from `daily_report_events` + `checkin_log`.

2. API `GET /api/kinder/parent-feed/:studentId?date=YYYY-MM-DD` — agregă evenimentele zilei:
   - check-in/check-out din `checkin_log` pentru data dată
   - toate evenimentele din `daily_report_events` (meals, naps, photos, activities, diapers, notes)
   - mesajele din `kinder_messages` pentru ziua dată
   - Returnează array sortat cronologic: `{ type: "checkin"|"checkout"|"diary"|"message", timestamp, data: {...} }`

3. API `GET /api/kinder/messages/:studentId` — lista mesajelor (toate timpurile, desc), cu `direction`, `body`, `sentAt`, `readAt`.

4. API `POST /api/kinder/messages/:studentId` — body: `{ body: string, direction: "staff_to_parent"|"parent_to_staff" }`. Crează mesaj. Returnează mesajul.

5. API `PATCH /api/kinder/messages/:studentId/:messageId/read` — marchează mesajul ca citit (setează `read_at = now()`).

6. UI `KinderParentFeedPage` (`/app/kinder/students/:studentId/feed`):
   - Timeline verticală cu events pentru data selectată (azi implicit).
   - Fiecare event are icon diferit: LogIn (check-in), LogOut (check-out), Utensils (masă), Moon (somn), Camera (foto), MessageCircle (mesaj staff), MessageCircleUser (mesaj parent).
   - Secțiune "Mesaje" la baza paginii: lista de mesaje cu buton "Trimite mesaj" (textarea + send).
   - Date picker simplu pentru a naviga la altă zi.

7. Route `/app/kinder/students/:studentId/feed` adăugat în `App.tsx`.

8. Link "Feed parental" adăugat în sidebar (sub KINDER-004).

9. Migrare SQL `0032_kinder005_messages.sql` commitată. `db:reset && db:seed` green.

10. Test: `KinderParentFeedPage` se renderizează fără crash. API `POST /api/kinder/messages/:studentId` returnează 201 cu mesajul creat.

## Files

### New
- `server/db/schema/kinderMessages.ts` — `kinder_messages` table
- `server/routes/kinderParentFeed.ts` — feed + messages routes
- `src/pages/app/KinderParentFeedPage.tsx` — timeline + messaging UI
- `src/__tests__/kinder-parent-feed.test.tsx` — unit tests
- `drizzle/0032_kinder005_messages.sql` — migration

### Modified
- `server/db/schema/index.ts` — export kinderMessages
- `server/app.ts` — mount kinderParentFeed routes
- `src/App.tsx` — add route `/app/kinder/students/:studentId/feed`
- `src/lib/api/kinder.ts` — add parent feed + messages API helpers
- `src/components/app/AppShell.tsx` — add sidebar link

## Tests

- **T-KINDER-005-1** [blocant] Given the app is running, When GET /api/kinder/parent-feed/:studentId with auth, Then returns 200 with a sorted timeline array.
- **T-KINDER-005-2** [blocant] Given a student exists, When POST /api/kinder/messages/:studentId with body and direction, Then returns 201 with message record.
- **T-KINDER-005-3** [blocant] Given KinderParentFeedPage renders with mock data, When the component mounts, Then it renders without throwing.
- **T-KINDER-005-4** [blocant] Given schema is migrated, When db:reset && db:seed run, Then no error is thrown.
- **T-KINDER-005-5** [normal] Given a student has 2 diary events today, When GET /api/kinder/parent-feed, Then feed contains both events.
- **T-KINDER-005-6** [normal] Given a message exists with read_at null, When PATCH /api/kinder/messages/:studentId/:messageId/read, Then read_at is set.

## DoD

- [ ] Migration committed (`0032_kinder005_messages.sql`)
- [ ] `db:reset && db:seed` green
- [ ] API smoke: login + GET /api/kinder/parent-feed/:studentId → 200
- [ ] Build + typecheck + lint green
- [ ] Unit tests green
- [ ] Reviewer APPROVED
- [ ] PR on `feat/KINDER-faza-1-checkin-diary-ratio`

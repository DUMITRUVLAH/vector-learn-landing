---
id: KINDER-002
title: Daily report / child diary — meals, naps, diapers, activities, photos
milestone: KINDER
phase: "1"
branch: feat/KINDER-faza-1-checkin-diary-ratio
status: pending
attempts: 0
depends_on: [KINDER-001]
---

## Goal

Brightwheel/Famly câștigă grădinițe cu un "child diary" trimis zilnic părinților: mesele servite,
somnul de prânz, schimbări de scutec, activitățile zilei și eventual o fotografie. Adăugăm o
interfață simplă pentru educatoare care înregistrează aceste evenimente în timp real, și un
endpoint care permite părintelui să vizualizeze raportul zilei fiului/fiicei sale.

## User stories

- Ca educatoare, vreau să înregistrez rapid ce a mâncat, când a dormit și câte schimbări de scutec a avut fiecare copil, pentru că părinții cer aceste informații zilnic.
- Ca manager, vreau să pot atașa o fotografie la raportul zilei, pentru că părinții plătesc mai mult când văd că centrul e angajat.
- Ca parent, vreau să primesc raportul zilnic prin email/notificare, pentru că vreau să știu cum a petrecut copilul ziua.
- Ca educatoare, vreau să completez evenimentele pe rând pe parcursul zilei, nu la final, pentru că uit detalii dacă aștept.

## Acceptance criteria

1. Schema: tabelul `daily_report_events` (id, tenant_id, student_id, date DATE, event_type ENUM('meal','nap','diaper','activity','photo','note'), details JSONB, photo_url TEXT, created_at, staff_user_id). JSONB conține câmpuri specifice tipului: meal → `{food, amount_ml, reaction}`, nap → `{start_time, end_time}`, diaper → `{type: "wet"|"soiled"|"both"}`, activity → `{description}`.
2. API `GET /api/kinder/diary/:studentId?date=YYYY-MM-DD` — returnează toate evenimentele copilului pentru data respectivă.
3. API `POST /api/kinder/diary` — body: `{ studentId, eventType, details, photoUrl? }`. Creează eveniment pentru ziua curentă. Returnează event.
4. API `DELETE /api/kinder/diary/:eventId` — șterge un eveniment (erori de logare).
5. UI `KinderDiaryPage` (`/app/kinder/diary`): selector copil + selector dată, timeline verticală a evenimentelor zilei. Fiecare card afișează iconul tipului + detalii. Buton "Adaugă eveniment" deschide modal cu selector tip + câmpuri dinamice.
6. Tipuri vizualizate cu iconuri diferite: masa (furculiță), somnul (lună), scutec (drop), activitate (joc), foto (cameră), notă (creion).
7. Modal pentru foto: câmp URL (în producție s-ar folosi upload S3, dar pentru demo acceptăm URL extern).
8. Migrare SQL: `0029_kinder002_diary.sql`.
9. Route-ul `/app/kinder/diary` adăugat în `App.tsx` și link în sidebar sub "Grădiniță".
10. Test: renderizare fără crash, POST /api/kinder/diary returnează 200.

## Files

### New
- `server/db/schema/kinderDiary.ts` — `daily_report_events` table
- `server/routes/kinderDiary.ts` — diary CRUD routes
- `src/pages/app/KinderDiaryPage.tsx` — diary UI
- `src/__tests__/kinder-diary.test.tsx` — unit tests
- `drizzle/0029_kinder002_diary.sql` — migration

### Modified
- `server/db/schema/index.ts` — export kinderDiary
- `server/routes/kinder.ts` OR `server/app.ts` — mount diary routes
- `src/App.tsx` — add `/app/kinder/diary` route
- `src/components/AppShell.tsx` — diary link in sidebar

## Tests

- **T-KINDER-002-1** [blocant] Given the app boots, When GET /api/kinder/diary/:studentId?date=today, Then 200 with array (empty ok).
- **T-KINDER-002-2** [blocant] Given a student exists, When POST /api/kinder/diary with eventType "meal" and details, Then 200 and event created with correct date.
- **T-KINDER-002-3** [blocant] Given KinderDiaryPage renders with mock data, When component mounts, Then renders without crash.
- **T-KINDER-002-4** [normal] Given event_type "nap" with start_time/end_time in JSONB, When GET diary for that student+date, Then nap card shows both times.
- **T-KINDER-002-5** [blocant] Given migration 0029 applied, When db:reset runs, Then no error.

## DoD

- [ ] Migration committed (`0029_kinder002_diary.sql`)
- [ ] `db:reset && db:seed` green
- [ ] API smoke: login + GET /api/kinder/diary/:studentId?date=... → 200
- [ ] Build + typecheck + lint green
- [ ] Unit tests green
- [ ] Reviewer APPROVED
- [ ] On same branch as KINDER-001: `feat/KINDER-faza-1-checkin-diary-ratio`

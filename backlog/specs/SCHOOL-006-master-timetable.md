---
id: SCHOOL-006
title: "Orar master — grilă clasă×materie×profesor×sală (săptămânal)"
milestone: SCHOOL
phase: 1
status: pending
depends_on: [SCHOOL-001, SCHOOL-002]
slug: master-timetable
---

## Goal

Modulul de orar master pentru o școală privată K-12. Administratorul definește orarul
**săptămânal** al fiecărei clase: care profesor predă ce materie, în ce sală, în ce zi și
în ce interval orar. Există o grilă vizuală (zile × ore) care permite adăugarea/editarea
sloturilor și detectarea conflictelor (profesor/sală ocupate în același interval).

Tot tenant-safe, conectat la: `school_classes` (SCHOOL-001), `school_subjects` (SCHOOL-002),
`teachers`, `rooms` (SCHED-501).

## In scope

### Schema nouă `server/db/schema/timetable.ts`
- `timetable_slots`: `id`, `tenantId` (FK cascade), `classId` (FK → school_classes cascade),
  `subjectId` (FK → school_subjects cascade), `teacherId` (FK → teachers, set null on delete),
  `roomId` (FK → rooms null, set null on delete), `dayOfWeek integer` (1=Luni … 5=Vineri, 6=Sâmbătă),
  `startTime time not null`, `endTime time not null`, `notes varchar(200) null`, timestamps.
  - Constrângere de non-overlap: unicitate soft (nu UNIQUE constraint DB — conflict-detection se face
    în ruta, nu DB, pentru UX mai bun).
  - Index pe `(tenantId, classId)`, `(tenantId, teacherId, dayOfWeek)`,
    `(tenantId, roomId, dayOfWeek)`.
- Export în `server/db/schema/index.ts`.

### `server/lib/timetable.ts` (funcții pure, testate)
- `detectConflicts(slots, newSlot)`: întoarce lista de conflicte (tip `'teacher' | 'room' | 'class'`,
  slotId conflictual, mesaj RO) pentru un slot propus față de lista existentă.
  - Conflict teacher: același `teacherId` + `dayOfWeek` + overlap interval orar.
  - Conflict room: același `roomId` non-null + `dayOfWeek` + overlap interval orar.
  - Conflict clasă: aceeași `classId` + `dayOfWeek` + overlap interval orar.
- `timeOverlap(a: {start, end}, b: {start, end}): boolean` — overlap dacă `a.start < b.end && b.start < a.end`.
- `slotLabel(dayOfWeek, startTime, endTime)`: „Luni 08:00–09:00".
- `dayName(dow: number): string` — „Luni" … „Vineri", „Sâmbătă".

### Migrare
- Fișier manual `drizzle/0033_school006_timetable.sql` (prefix 0033 > max 0032).
  Enumul CREATE TYPE (dacă există) wrapat în DO $$ BEGIN … EXCEPTION WHEN duplicate_object THEN null; END $$;
- Journal actualizat `drizzle/meta/_journal.json`.

### `server/routes/timetable.ts`
- `GET /api/school/timetable?classId=&yearId=` → lista sloturilor clasei, cu join la subject/teacher/room.
  Limitare ≤ 100 sloturi (Zod `.max(100)`).
- `POST /api/school/timetable` body `{classId, subjectId, teacherId?, roomId?, dayOfWeek, startTime, endTime, notes?}`
  → detectează conflicte înainte de insert; dacă există → 409 cu `{error: "conflict", conflicts: [...]}`; altfel 201.
- `PATCH /api/school/timetable/:id` — modificare slot; re-detectează conflicte.
- `DELETE /api/school/timetable/:id` — șterge slot.
- Montat în `server/app.ts` la `/api/school/timetable`.

### UI `src/pages/app/SchoolTimetablePage.tsx` la `/app/school/timetable`
- Selector „Clasă" (dropdown, clasele anului curent).
- Grilă 5 coloane (Luni–Vineri) × rânduri de timp (08:00–18:00, intervale din sloturi).
- Fiecare slot afișat ca card cu materia, profesorul, sala, buton delete.
- Buton „Adaugă slot" → modal cu formular (clasă prefixată, zi, oră start/end, materie, profesor, sală).
- Conflicte afișate ca toast/banner cu descriere RO.
- Tokeni Vector 365, dark-mode, RO.
- `src/lib/api/timetable.ts`: funcțiile client.

### Link nav
- Adaugă „Orar" în AppShell sub „Clase" (icon `CalendarDays`).

## Out of scope
- Generare automată de orar (algoritmic).
- Vizualizare per profesor sau per sală.
- Orar print/PDF.
- Conflict auto-resolve.

## Acceptance criteria
- AC1: Pot adăuga un slot (Luni, 08:00–09:00, Matematică, Prof. X, Sala 1) pentru o clasă.
- AC2: Dacă adaug un al doilea slot pentru același profesor, zi, interval ce se suprapune → 409 conflict.
- AC3: Dacă adaug un al doilea slot pentru aceeași sală, zi, interval ce se suprapune → 409 conflict.
- AC4: Dacă adaug un al doilea slot pentru aceeași clasă, zi, interval ce se suprapune → 409 conflict.
- AC5: Pot șterge un slot; grila se actualizează.
- AC6: `detectConflicts` pur returnează conflicte corecte fără DB.
- AC7: Migrare 0033 committed, no collision; `db:reset && db:seed` trec; GET /api/school/timetable → 200.

## Tests (Given/When/Then)

- **T-SCHOOL-006-1** [blocant] Given schema timetable.ts, When migrare aplicată, Then tabelul
  `timetable_slots` există cu coloanele corecte și prefixul migrării este 0033 > 0032.
- **T-SCHOOL-006-2** [blocant] Given un slot Luni 08:00–09:00 pentru Prof. X, When POST cu același
  profesor Luni 08:30–09:30, Then 409 `{error:"conflict", conflicts:[{type:"teacher"}]}`.
- **T-SCHOOL-006-3** [blocant] Given un slot Luni 08:00–09:00 în Sala 1, When POST cu aceeași sală
  Luni 08:00–08:30, Then 409 `{error:"conflict", conflicts:[{type:"room"}]}`.
- **T-SCHOOL-006-4** [blocant] Given serverul pornit, When login + `GET /api/school/timetable?classId=x`,
  Then 200 + JSON `{slots:[]}` (live API smoke).
- **T-SCHOOL-006-5** [normal] Given `timeOverlap({start:"08:00",end:"09:00"}, {start:"08:30",end:"09:30"})`,
  When apelat, Then returnează `true`.
- **T-SCHOOL-006-6** [normal] Given `timeOverlap({start:"08:00",end:"09:00"}, {start:"09:00",end:"10:00"})`,
  When apelat, Then returnează `false` (adiacent, nu overlap).
- **T-SCHOOL-006-7** [normal] Given SchoolTimetablePage, When randat cu mock, Then se afișează grila
  fără crash.

## DoD
Build+typecheck+lint+unit verzi, migrare 0033 committed fără collision, `db:reset`+`db:seed` OK,
API live 200, reviewer APPROVED după review→improve, persona reports salvate,
commit pe `feat/SCHOOL-faza-1-fundatie`.

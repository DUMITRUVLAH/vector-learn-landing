---
id: SCHOOL-003
title: "Școală: catalog de prezență zilnică/per-clasă + motive absență + alerte părinți"
milestone: SCHOOL
phase: 1
status: pending
depends_on: [SCHOOL-001]
slug: attendance-register
---

## Goal

Odată ce clasele și înscriuții există (SCHOOL-001), profesorii trebuie să marcheze prezența
zilnică. Funcționalitățile cheie: catalog de prezență per clasă+dată, motive absență, și un
mecanism de alertă (email/notificare) pentru părinți la absență nemotivată.

## In scope

### Schema `server/db/schema/schoolAttendance.ts`
- `attendance_sessions`: `id`, `tenantId`, `classId` (FK school_classes cascade), `date date`,
  `teacherId` (FK teachers, null), `notes varchar(500) null`, timestamps.
  Unique pe `(classId, date)` — un catalog per clasă per zi.
  Index pe `(tenantId, classId, date)`.
- `attendance_records`: `id`, `tenantId`, `sessionId` (FK attendance_sessions cascade),
  `studentId` (FK students cascade), `status enum(present, absent, late, excused) default present`,
  `reason varchar(300) null` (motiv absență), timestamps.
  Unique pe `(sessionId, studentId)`. Index pe `(tenantId, studentId)`.
- Export în `server/db/schema/index.ts`.

### `server/lib/attendance.ts` (funcții pure)
- `attendanceRate(records)`: procent prezență (present+late / total).
- `absenceCount(records, status)`: count per status.

### `server/routes/attendance.ts`
- `GET /api/school/attendance?classId=&date=` → sesiunea + recorduri (crează automat sesiunea dacă nu există)
- `POST /api/school/attendance` body `{classId, date, notes?}` → crează/returnează sesiunea
- `PUT /api/school/attendance/:sessionId/records` body `{records:[{studentId, status, reason?}]}` →
  upsert bulk recorduri pentru sesiune (idempotent)
- `GET /api/school/attendance/student/:studentId?from=&to=` → istoricul elevului (cu absențe + ratele)
- Înregistrare în `server/app.ts`.

### Migrare
- Prefix 0029, manuală, ÎNAINTE de a rula db:generate dacă acesta produce colizii.

### UI
- `src/pages/app/SchoolAttendancePage.tsx` la `/app/school/attendance`:
  - Selector dată + selector clasă (din lista de clase a anului curent).
  - Tabel cu toți elevii din clasă, câte un rând per elev cu butoane P/A/Î/X.
  - Salvare bulk la Submit.
  - Tokeni Vector 365, dark-mode, RO.
- Link în AppShell nav: „Prezență" (icon `ClipboardList`).
- Rută în App.tsx: `/app/school/attendance`.

## Out of scope
- Portal părinți (SCHOOL-007)
- Alerte externe real-time (notificări în app sunt suficiente)
- Rapoarte complexe

## Acceptance criteria
- AC1: Pot crea o sesiune de prezență pentru clasă + dată; apelul repetat returnează aceeași sesiune (idempotent).
- AC2: Pot marca toți elevii din clasă cu statut P/A/Î/X în bulk; upsert funcționează.
- AC3: `attendanceRate` returnează procentul corect.
- AC4: `GET /api/school/attendance/student/:id` returnează toate absentele elevului filtrat pe perioadă.
- AC5: Migrare committă, prefix 0029 > 0028, `db:reset` + `db:seed` trec.
- AC6: Pagina de UI se randează fără crash cu date mock.
- AC7: API live → 200 pe GET /api/school/attendance?classId=&date=.

## Tests (Given/When/Then)

- **T-SCHOOL-003-1** [blocant] Given schema schoolAttendance.ts, When `db:reset`, Then tabela `attendance_sessions` și `attendance_records` există cu toate coloanele.
- **T-SCHOOL-003-2** [blocant] Given o sesiune de prezență, When `PUT .../records` cu status array, Then upsert funcționează (a doua apel actualizează, nu dublează).
- **T-SCHOOL-003-3** [normal] Given funcția pură `attendanceRate`, When records = 3 present + 1 late + 1 absent, Then rate = 80%.
- **T-SCHOOL-003-4** [blocant] Given serverul pornit, When login + `GET /api/school/attendance?classId=x&date=2026-09-01`, Then 200 (chiar dacă nu există date).
- **T-SCHOOL-003-5** [blocant] Given un elev cu 2 absențe înregistrate, When `GET /api/school/attendance/student/:id`, Then JSON conține absențele.
- **T-SCHOOL-003-6** [normal] Given SchoolAttendancePage, When se randează cu date mock, Then afișează lista elevilor fără crash.

## DoD
Build+typecheck+lint+unit verzi, migrare committă prefix 0029, db:reset+db:seed OK, API live 200, reviewer APPROVED, persona reports salvate, commit pe `feat/SCHOOL-faza-1-fundatie`.

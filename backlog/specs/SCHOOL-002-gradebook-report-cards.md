---
id: SCHOOL-002
title: "Școală: catalog note (gradebook) + fișe individuale (report cards PDF)"
milestone: SCHOOL
phase: 1
status: pending
depends_on: [SCHOOL-001]
slug: gradebook-report-cards
---

## Goal

Cu clasele și termele deja create (SCHOOL-001), profesorii pot introduce note per elev per
materie per termen. La final de semestru, directorul generează fișa individuală PDF cu mediile.

## In scope

### Schema `server/db/schema/schoolGrades.ts`
- `school_subjects`: `id`, `tenantId`, `name varchar(100)` (ex. „Matematică"), `code varchar(20) null`,
  timestamps. Index pe `(tenantId)`.
- `grade_entries`: `id`, `tenantId`, `classId` (FK school_classes cascade), `studentId` (FK students cascade),
  `subjectId` (FK school_subjects cascade), `termId` (FK academic_terms cascade),
  `value numeric(4,2)` (nota, 1-10 sau 1-100), `weight numeric(4,2) default 1` (ponderea),
  `type enum(test, homework, oral, final) default test`, `gradedAt date`,
  `teacherId` (FK teachers null), `notes varchar(500) null`, timestamps.
  Index pe `(tenantId, classId, studentId)`.
- Export în `server/db/schema/index.ts`.

### `server/lib/gradebook.ts` (funcții pure)
- `weightedAverage(entries)`: medie ponderată a notelor.
- `termSummary(entries, termId)`: {termId, average, count, min, max} per materie.
- `reportCardData(student, classes, entries, terms, subjects)`: obiect pregătit pentru PDF.

### `server/routes/grades.ts`
- `GET /api/school/grades?classId=&termId=&subjectId=` → lista note filtrate
- `POST /api/school/grades` body `{classId, studentId, subjectId, termId, value, weight?, type?, gradedAt, notes?}`
- `PATCH /api/school/grades/:id`, `DELETE /api/school/grades/:id`
- `GET /api/school/grades/student/:studentId?termId=` → toate notele elevului (cu average per subiect)
- `GET /api/school/grades/report-card/:studentId/:termId` → date pentru fișa individuală (JSON structurat)
- `GET /api/school/subjects`, `POST /api/school/subjects`, `PATCH/DELETE /api/school/subjects/:id`
- Înregistrare în `server/app.ts`.

### Migrare
- Prefix 0030, manuală.

### UI
- `src/pages/app/SchoolGradebookPage.tsx` la `/app/school/gradebook`:
  - Selector clasă + materie + termen.
  - Tabel elevi cu notele lor per termen, medie calculată vizibil.
  - Buton „Adaugă notă" → form rapid.
  - Tokeni Vector 365, dark-mode, RO.
- Link în AppShell nav: „Note" (icon `BookMarked`).

## Out of scope
- Generare PDF (se face client-side sau pe server în faza ulterioară)
- Portal părinți (SCHOOL-007)
- Catalog de prezență → SCHOOL-003

## Acceptance criteria
- AC1: Pot adăuga note per elev per materie per termen; `GET .../grades` filtrează corect.
- AC2: `weightedAverage` calculează corect media ponderată.
- AC3: `GET /api/school/grades/student/:id` returnează notele elevului cu media per subiect.
- AC4: `GET /api/school/grades/report-card/:studentId/:termId` returnează datele structurate.
- AC5: Migrare committă prefix 0030, `db:reset` + `db:seed` trec.
- AC6: UI se randează fără crash cu date mock.
- AC7: API live → 200 pe GET /api/school/grades.

## Tests (Given/When/Then)

- **T-SCHOOL-002-1** [blocant] Given schema schoolGrades.ts, When db:reset, Then `grade_entries` și `school_subjects` există.
- **T-SCHOOL-002-2** [normal] Given funcția `weightedAverage`, When entries = [{value:8, weight:2}, {value:10, weight:1}], Then result = 8.67 (2 zecimale).
- **T-SCHOOL-002-3** [blocant] Given serverul pornit, When login + `GET /api/school/grades`, Then 200 + JSON.
- **T-SCHOOL-002-4** [blocant] Given un elev cu 3 note în Semestrul I, When `GET /api/school/grades/student/:id?termId=X`, Then JSON include average per materie.
- **T-SCHOOL-002-5** [normal] Given SchoolGradebookPage, When se randează cu date mock, Then afișează titlul paginii fără crash.
- **T-SCHOOL-002-6** [blocant] Given migrarea 0030, When `db:reset`, Then prefixul > 0029 și migrarea trece.

## DoD
Build+typecheck+lint+unit verzi, migrare committă prefix 0030, db:reset+db:seed OK, API live 200, reviewer APPROVED, persona reports salvate, commit pe `feat/SCHOOL-faza-1-fundatie`.

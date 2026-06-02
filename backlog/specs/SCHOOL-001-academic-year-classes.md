---
id: SCHOOL-001
title: "Școală: an școlar + termene (semestre) + clase/secțiuni permanente + înscrierea elevului în clasă"
milestone: SCHOOL
phase: 1
status: pending
depends_on: []
slug: academic-year-classes
---

## Goal

Fundația modulului de **școală privată K-12**. Spre deosebire de „cohortele" de curs (CX, care sunt
ediții temporare), o școală are: un **an școlar** împărțit în **termene** (semestre/trimestre), **clase
permanente** (ex. „Clasa a V-a A") în care un elev e înscris pentru tot anul, și un **diriginte**.
Toate celelalte feature-uri de școală (catalog SCHOOL-002, prezență SCHOOL-003, taxe SCHOOL-004) se
leagă de aceste entități, deci se construiește prima.

Această fază aduce **schema + rutele + funcțiile de business**. NU aduce catalog/note (SCHOOL-002) și
nici UI complex — doar listele/CRUD de bază și o pagină simplă de administrare clase.

Tot tenant-safe: fiecare entitate are `tenantId` (FK cascade), fiecare query filtrează pe `tenantId`
din contextul de auth.

## In scope

### Schema nouă `server/db/schema/school.ts`
- `academic_years`: `id`, `tenantId`, `name` (ex. „2026–2027"), `startDate date`, `endDate date`,
  `isCurrent boolean default false` (doar unul curent per tenant — enforce în rută), timestamps.
- `academic_terms`: `id`, `tenantId`, `academicYearId` (FK cascade), `name` (ex. „Semestrul I"),
  `startDate date`, `endDate date`, `orderIndex integer`, timestamps.
- `school_classes`: `id`, `tenantId`, `academicYearId` (FK cascade), `name` (ex. „a V-a A"),
  `gradeLevel varchar` (ex. „5"), `section varchar null` (ex. „A"), `homeroomTeacherId` (FK → teachers, null),
  `capacity integer null`, timestamps. Index pe `(tenantId, academicYearId)`.
- `class_enrollments`: `id`, `tenantId`, `classId` (FK cascade), `studentId` (FK → students cascade),
  `enrolledAt timestamp`, `status enum(active, transferred, withdrawn) default active`, timestamps.
  Unique pe `(classId, studentId)` ca să nu se dubleze. Index pe `(tenantId, studentId)`.
- Export în `server/db/schema/index.ts`.

### `server/lib/schoolYear.ts` (funcții pure, testate)
- `getCurrentTerm(terms, date)`: întoarce termenul în care cade `date` (sau null).
- `classDisplayName(gradeLevel, section)`: „a V-a A" din („5","A").
- `enrollmentCount(enrollments)` + `seatsRemaining(capacity, enrollments)`.

### `server/routes/school.ts` (CRUD tenant-safe, auth existent)
- `GET/POST /api/school/years`, `PATCH/DELETE /api/school/years/:id`. POST cu `isCurrent:true`
  setează celelalte pe false (un singur an curent).
- `GET/POST /api/school/terms` (filtrabil `?yearId=`), `PATCH/DELETE /api/school/terms/:id`.
- `GET/POST /api/school/classes` (filtrabil `?yearId=`), `PATCH/DELETE /api/school/classes/:id`.
  GET întoarce și `enrollmentCount` + `homeroomTeacherName`.
- `POST /api/school/classes/:id/enroll` body `{studentId}` → creează `class_enrollments`
  (verifică capacitatea; 409 dacă plin sau deja înscris). `DELETE .../enroll/:studentId` → withdraw.
- Înregistrare rută în `server/app.ts` (montată ÎNAINTE de orice `requireAuth` global pe `/api`
  care ar intercepta — vezi pattern-ul din app.ts).

### Migrare
- `npm run db:generate` → migrare committed; prefix > maxul curent de pe main (gate 4a-bis).
- `db:reset && db:seed` trec.

### UI minim
- `src/pages/app/SchoolClassesPage.tsx` la `/app/school/classes`: listă clase pentru anul curent,
  buton „Adaugă clasă", click pe clasă → listă elevi înscriși + buton „Înscrie elev" (din elevii
  existenți, status active). Tokeni Vector 365, dark-mode, RO.
- Link în AppShell nav: „Clase" (icon `School` sau `Users`), vizibil.
- `src/lib/api/school.ts`: funcțiile client corespunzătoare.

## Out of scope

- Catalog/note + report cards → SCHOOL-002
- Catalog de prezență zilnică → SCHOOL-003
- Taxe școlare → SCHOOL-004
- Admitere → SCHOOL-005
- Orar master → SCHOOL-006
- Portal părinte → SCHOOL-007

## Acceptance criteria

- AC1: Pot crea un an școlar; setarea `isCurrent` pe unul nou îl scoate pe cel vechi din „current".
- AC2: Pot crea termene legate de an; `getCurrentTerm` întoarce corect termenul pentru o dată dată.
- AC3: Pot crea o clasă în anul curent cu diriginte (opțional) și capacitate.
- AC4: Pot înscrie un elev existent în clasă; nu pot înscrie de două ori (409); nu pot depăși capacitatea (409).
- AC5: Lista de clase arată numărul de elevi înscriși și numele dirigintelui.
- AC6: Tot e tenant-scoped: un tenant nu vede clasele/anii altui tenant.
- AC7: Migrarea e committed, fără prefix-collision; `db:reset && db:seed` trec; API live → 200.

## Tests (Given/When/Then)

- **T-SCHOOL-001-1** [blocant] Given schema school.ts, When `npm run db:generate`, Then NU rămâne
  migrare necommitted ȘI prefixul nou > maxul de pe origin/main (gate migrare + collision).
- **T-SCHOOL-001-2** [blocant] Given un tenant logat, When `POST /api/school/years {isCurrent:true}`
  de două ori, Then doar ultimul are `isCurrent:true` (200, verificat în GET).
- **T-SCHOOL-001-3** [blocant] Given o clasă cu `capacity:1` și un elev înscris, When `POST .../enroll`
  cu al doilea elev, Then 409 „class_full".
- **T-SCHOOL-001-4** [blocant] Given un elev deja înscris, When `POST .../enroll` cu același studentId,
  Then 409 „already_enrolled".
- **T-SCHOOL-001-5** [normal] Given funcția pură `getCurrentTerm`, When data cade în Semestrul II,
  Then întoarce termenul II (test unitar, fără DB).
- **T-SCHOOL-001-6** [normal] Given SchoolClassesPage, When se randează cu o clasă mock, Then afișează
  numele clasei + count înscriși fără crash (render test).
- **T-SCHOOL-001-7** [blocant] Given serverul pornit, When login + `GET /api/school/classes`, Then 200
  + JSON cu `items[]` (live API smoke).

## DoD
Build+typecheck+lint+unit verzi, migrare committed fără collision, `db:reset`+`db:seed` OK, API live
200, reviewer APPROVED după review→improve, persona reports salvate, PR pe `feat/SCHOOL-faza-1-fundatie`.

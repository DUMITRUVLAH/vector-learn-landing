---
id: SCHOOL-004
title: "Școală: facturare taxă școlară — planuri anuale/termene, rate, reducere frați, bursă"
milestone: SCHOOL
phase: 1
status: pending
depends_on: []
slug: tuition-billing
---

## Goal

Modulul de **taxă școlară** pentru școală privată K-12. Un administrator definește un **plan de
taxă** (anual sau per termen), împarte suma în **rate lunare/trimestriale**, aplică
**reducere pentru frați** (al 2-lea copil −10%, al 3-lea −20%) și **burse/ajutor financiar**
(sumă fixă sau %). Planul generează automat **facturi** (refolosind tabelul `invoices` existent).

Conectare: `tuition_plans` referă `school_classes` + `academic_years` (SCHOOL-001 FKs);
facturile generate sunt în tabelul `invoices` existent (studentId FK).

## In scope

### Schema `server/db/schema/tuition.ts`
- `tuition_plans`: `id`, `tenantId`, `academicYearId` (FK → academic_years cascade),
  `name varchar(200)` (ex. „Taxă anuală 2026-2027"), `amountCents integer` (suma totală),
  `currency varchar(3) default 'RON'`, `billingCycle enum(annual, per_term, monthly) default annual`,
  `siblingDiscountPercent numeric(4,1) default 0`, timestamps.
  Index pe `(tenantId, academicYearId)`.
- `tuition_installments`: `id`, `tenantId`, `planId` (FK → tuition_plans cascade),
  `dueDate date`, `amountCents integer`, `orderIndex integer`, timestamps.
  Unique pe `(planId, orderIndex)`.
- `student_tuition`: `id`, `tenantId`, `studentId` (FK → students cascade),
  `planId` (FK → tuition_plans cascade), `classId` (FK → school_classes cascade null),
  `siblingRank integer default 1` (1=primul copil; 2,3... → reducere frați),
  `scholarshipAmountCents integer default 0` (bursă ca sumă fixă),
  `scholarshipPercent numeric(4,1) default 0` (bursă ca % din taxă),
  `notes text null`, timestamps. Unique pe `(tenantId, studentId, planId)`.
- Export în `server/db/schema/index.ts`.

### `server/lib/tuition.ts` (funcții pure)
- `siblingDiscount(siblingRank, basePercent)`: 0 dacă rank=1, basePercent dacă rank=2,
  basePercent*2 dacă rank=3+.
- `effectiveAmount(amountCents, siblingRank, siblingDiscountPercent, scholarshipCents, scholarshipPercent)`:
  aplică reducerile și returnează suma netă în cents (minim 0).
- `installmentSchedule(netAmountCents, installments)`: împarte suma în N rate egale
  (ultimul rate preia restul din rotunjire).

### `server/routes/tuition.ts`
- `GET /api/school/tuition/plans?yearId=` — liste planuri.
- `POST /api/school/tuition/plans` body `{academicYearId, name, amountCents, billingCycle?, siblingDiscountPercent?}`.
- `PATCH/DELETE /api/school/tuition/plans/:id`.
- `GET /api/school/tuition/plans/:id/installments` — ratele unui plan.
- `POST /api/school/tuition/plans/:id/installments` body `{dueDate, amountCents, orderIndex}`.
- `DELETE /api/school/tuition/plans/:id/installments/:iid`.
- `GET /api/school/tuition/students?planId=` — elevii asignați unui plan.
- `POST /api/school/tuition/students` body `{studentId, planId, classId?, siblingRank?, scholarshipAmountCents?, scholarshipPercent?}`.
- `PATCH /api/school/tuition/students/:id`, `DELETE /api/school/tuition/students/:id`.
- `POST /api/school/tuition/students/:id/generate-invoices` — pentru fiecare rată, creează
  o factură în tabelul `invoices` (dacă nu există deja). Returnează lista facturilor create.
- Înregistrare în `server/app.ts`.

### Migrare handcrafted
- `drizzle/0031_school004_tuition.sql` (prefix 0031 > 0030).
- Conține DO $$...END $$ pentru enum billing_cycle (dacă e nou), CREATE TABLE, FK, INDEX.

### UI
- `src/pages/app/SchoolTuitionPage.tsx` la `/app/school/tuition`:
  - Lista planuri de taxă (an + sumă + ciclu).
  - Buton „Plan nou" → modal: an, sumă, ciclu, reducere frați%.
  - Click pe plan → lista rate + lista elevi cu suma efectivă.
  - Buton „Generează facturi" per elev → toast confirmare.
  - Tokeni Vector 365, dark-mode, RO.
- Link „Taxe" în AppShell sub Școală.
- `src/lib/api/tuition.ts` — funcții client cu limit ≤ 100.

## Out of scope
- Plata online a taxei → PORTAL-902
- Reconciliere automată cu plăți deja existente
- Notificări automate la scadență → COMM module

## Acceptance criteria
- AC1: Pot crea un plan de taxă cu rată lunară; ratele se generează corect.
- AC2: `siblingDiscount` întoarce 0 pentru primul copil, `basePercent` pentru al doilea.
- AC3: `effectiveAmount` aplică corect cumulat reducere frați + bursă (nu scade sub 0).
- AC4: `POST .../generate-invoices` creează facturi în `invoices` pentru fiecare rată (idempotent — a doua apelare nu dublează).
- AC5: Un tenant nu vede planurile altui tenant.
- AC6: Migrare 0031 committed, fără collision, `db:reset && db:seed` trec.
- AC7: API live `GET /api/school/tuition/plans` → 200.

## Tests (Given/When/Then)

- **T-SCHOOL-004-1** [blocant] Given schema tuition.ts, When db:reset, Then `tuition_plans`, `tuition_installments`, `student_tuition` există.
- **T-SCHOOL-004-2** [normal] Given `siblingDiscount(1, 10)`, When apelat, Then 0.
- **T-SCHOOL-004-3** [normal] Given `siblingDiscount(2, 10)`, When apelat, Then 10.
- **T-SCHOOL-004-4** [normal] Given `effectiveAmount(10000, 2, 10, 500, 0)`, When apelat, Then 10000*(1-0.10)-500 = 8500.
- **T-SCHOOL-004-5** [blocant] Given server pornit, When login + `GET /api/school/tuition/plans`, Then 200 + JSON (smoke).
- **T-SCHOOL-004-6** [normal] Given SchoolTuitionPage, When se randează cu date mock, Then afișează titlul fără crash.
- **T-SCHOOL-004-7** [blocant] Given migrare 0031, When db:reset, Then prefix > 0030.

## DoD
Build+typecheck+lint+unit verzi, migrare 0031 committed fără collision, db:reset+db:seed OK,
API live 200, reviewer APPROVED, persona reports salvate, commit pe `feat/SCHOOL-faza-1-fundatie`.

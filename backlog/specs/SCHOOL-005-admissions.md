---
id: SCHOOL-005
title: "Școală: dosar de admitere — aplicație → documente → decizie → înscriere"
milestone: SCHOOL
phase: 1
status: pending
depends_on: []
slug: admissions
---

## Goal

Flux complet de **admitere** pentru școală privată K-12. Un aplicant (poate fi deja un lead din
CRM sau o persoană nouă) parcurge: **Aplicație** → **Documente încărcate** → **Decizie
(acceptat/respins/lista de așteptare)** → **Înscrierea efectivă** (creează studentul și îl
asignează la o clasă din SCHOOL-001).

Conectare cu CRM: `admission_applications` poate lega un `leadId` opțional (FK → leads).
La înscrierea efectivă → creăm un `student` (dacă nu există) și un `class_enrollment`.

## In scope

### Schema `server/db/schema/admissions.ts`
- `admission_applications`: `id`, `tenantId`, `academicYearId` (FK → academic_years cascade),
  `applicantName varchar(200)`, `applicantEmail varchar(200) null`,
  `applicantPhone varchar(50) null`, `guardianName varchar(200) null`,
  `guardianPhone varchar(50) null`, `gradeLevel varchar(10)` (clasa dorită: „1","5"),
  `status enum(draft, submitted, review, accepted, waitlisted, rejected, enrolled) default draft`,
  `leadId uuid null` (FK → leads on delete set null — legătură opțională CRM),
  `decisionNotes text null`, timestamps.
  Index pe `(tenantId, academicYearId, status)`.
- `admission_documents`: `id`, `tenantId`, `applicationId` (FK → admission_applications cascade),
  `name varchar(200)` (ex. „Certificat de naștere"), `status enum(required, received, verified) default required`,
  `uploadedAt timestamp null`, `notes varchar(500) null`, timestamps.
  Index pe `(tenantId, applicationId)`.
- Export în `server/db/schema/index.ts`.

### `server/lib/admissions.ts` (funcții pure)
- `isEligibleToEnroll(app)`: aplicația are status `accepted` și toate documentele au status
  `verified` (sau nu există documente required în status `required`).
- `admissionStatusLabel(status)`: returnează eticheta română pentru fiecare status.

### `server/routes/admissions.ts`
- `GET /api/school/admissions?yearId=&status=` — lista aplicații (limit 100).
- `POST /api/school/admissions` body `{academicYearId, applicantName, applicantEmail?, gradeLevel, guardianName?, guardianPhone?, leadId?}`.
- `PATCH /api/school/admissions/:id` — actualizare câmpuri + status (cu decisionNotes).
- `DELETE /api/school/admissions/:id`.
- `GET /api/school/admissions/:id/documents` — documentele aplicației.
- `POST /api/school/admissions/:id/documents` body `{name, status?}`.
- `PATCH /api/school/admissions/:id/documents/:did` — actualizare document (mark received/verified).
- `DELETE /api/school/admissions/:id/documents/:did`.
- `POST /api/school/admissions/:id/enroll` — finalizare înscriere:
  1. Verifică `isEligibleToEnroll` → 400 dacă nu.
  2. Body optional `{classId?, studentId?}`.
  3. Dacă `studentId` e furnizat, refolosim elevul existent. Altfel creăm un student nou din
     `applicantName` + `applicantEmail` + `applicantPhone`.
  4. Dacă `classId` furnizat → creăm `class_enrollment`.
  5. Actualizăm `status → enrolled`.
  6. Returnează `{ studentId, enrollmentId? }`.
- Înregistrare în `server/app.ts`.

### Migrare handcrafted
- `drizzle/0032_school005_admissions.sql` (prefix 0032 > 0031).
- Enum `admission_status` și `admission_document_status` wrapped DO $$...END $$.

### UI
- `src/pages/app/SchoolAdmissionsPage.tsx` la `/app/school/admissions`:
  - Kanban/listă aplicații grupate pe status: Draft → Aplicat → Review → Acceptat/Respins → Înscris.
  - Buton „Aplicație nouă" → modal.
  - Click pe aplicație → detalii: status curent, documente, buton „Acceptă/Respinge/Înscrie".
  - Tokeni Vector 365, dark-mode, RO.
- Link „Admitere" în AppShell sub Școală.
- `src/lib/api/admissions.ts` — funcții client, limit ≤ 100.

## Out of scope
- Upload efectiv de fișiere (doar meta-date despre document)
- Notificări email la acceptare → COMM
- Plata taxei de aplicație → SCHOOL-004 / PAY-901

## Acceptance criteria
- AC1: Pot crea o aplicație; statusul trece manual prin draft → submitted → review → accepted.
- AC2: `isEligibleToEnroll` returnează false dacă există documente în status `required` (nerecepționate).
- AC3: `POST .../enroll` cu documente neverificate → 400 `not_eligible`.
- AC4: `POST .../enroll` cu aplicație acceptată + toate doc verified → creează student + enrollment.
- AC5: Tenant safety — un tenant nu vede aplicațiile altui tenant.
- AC6: Migrare 0032 committed, fără collision, `db:reset && db:seed` trec.
- AC7: API live `GET /api/school/admissions` → 200.

## Tests (Given/When/Then)

- **T-SCHOOL-005-1** [blocant] Given schema admissions.ts, When db:reset, Then `admission_applications`, `admission_documents` există.
- **T-SCHOOL-005-2** [normal] Given aplicație cu status `accepted` și niciun document required, When `isEligibleToEnroll`, Then true.
- **T-SCHOOL-005-3** [normal] Given aplicație cu status `accepted` și un document cu status `required`, When `isEligibleToEnroll`, Then false.
- **T-SCHOOL-005-4** [blocant] Given server pornit, When login + `GET /api/school/admissions`, Then 200 + JSON (smoke).
- **T-SCHOOL-005-5** [normal] Given SchoolAdmissionsPage, When se randează cu date mock, Then afișează titlul fără crash.
- **T-SCHOOL-005-6** [blocant] Given migrare 0032, When db:reset, Then prefix > 0031.
- **T-SCHOOL-005-7** [normal] Given `admissionStatusLabel('accepted')`, Then returnează un string non-gol în română.

## DoD
Build+typecheck+lint+unit verzi, migrare 0032 committed fără collision, db:reset+db:seed OK,
API live 200, reviewer APPROVED, persona reports salvate, commit pe `feat/SCHOOL-faza-1-fundatie`.

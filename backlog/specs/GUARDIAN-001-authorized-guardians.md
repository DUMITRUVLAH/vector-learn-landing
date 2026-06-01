---
id: GUARDIAN-001
title: "Model tutori autorizați — mai mulți tutori per elev, flag-uri custodie/permisiuni, cine ridică/primește comms"
milestone: SCHOOL
phase: 1
status: pending
depends_on: [SCHOOL-001]
slug: authorized-guardians
---

## Goal

Extinde modelul `families` existent cu o tabelă `student_guardians` care permite asocierea
**mai multor tutori** la un elev (nu doar un payer), fiecare cu rolul său, drepturi de custodie,
permisiunea de a ridica copilul de la școală și preferințe de comunicare.

Util pentru: situații de divorț/custodie partajată, bunici, îngrijitori autorizați,
GDPR (știm cui comunicăm ce).

Legătura cu familia existentă: `families` rămâne entitatea de plată (payerName/payerEmail);
`student_guardians` extinde modelul cu tutori individuali per elev.

## In scope

### Schema nouă `server/db/schema/guardians.ts`
- `student_guardians`:
  - `id` uuid PK defaultRandom
  - `tenantId` (FK → tenants cascade)
  - `studentId` (FK → students cascade)
  - `fullName varchar(200) not null`
  - `relationship varchar(50)` — ex. „Mamă", „Tată", „Bunic", „Tutore legal"
  - `phone varchar(32)`
  - `email varchar(255)`
  - `isPrimary boolean not null default false` — tutorele principal (maxim 1 per elev, enforced în rută)
  - `hasCustody boolean not null default true` — drept legal de custodie
  - `canPickup boolean not null default true` — poate ridica copilul fizic
  - `receivesCommunications boolean not null default true` — primește notificări/facturi/note
  - `notes varchar(500)`
  - timestamps
  - Index pe `(tenantId, studentId)`.
- Export în `server/db/schema/index.ts`.

### Migrare
- Fișier manual `drizzle/0035_guardian001_student_guardians.sql` (prefix 0035 > max 0034).
  Fără CREATE TYPE (nu avem enum nou). Guard DO $$ dacă e necesar.
- Journal `drizzle/meta/_journal.json` actualizat.

### `server/routes/guardians.ts`
Toate rutele cer `requireAuth`. Montat la `/api/students/:studentId/guardians`.

- `GET /api/students/:studentId/guardians` → lista tutorilor elevului (verificare `tenantId`).
  Limitat ≤ 20 (un elev nu are 20 tutori în practică).
- `POST /api/students/:studentId/guardians` body `{fullName, relationship?, phone?, email?,
  isPrimary?, hasCustody?, canPickup?, receivesCommunications?, notes?}`
  → dacă `isPrimary:true`, scoatem `isPrimary=false` de pe toți ceilalți tutori ai elevului.
  Maxim 10 tutori per elev (409 „guardian_limit_reached" dacă > 10).
- `PATCH /api/students/:studentId/guardians/:guardianId` — modificare; re-enforce isPrimary unicitate.
- `DELETE /api/students/:studentId/guardians/:guardianId` → 204.
- Montat în `server/app.ts` la `/api/students` (sub ruta existentă).

### UI `src/pages/app/StudentGuardiansPanel.tsx`
- Componentă (nu pagină separată) afișată în StudentDetailPage (sau ca card în profilul elevului).
- Lista tutorilor cu badge-uri: „Primar", „Custodie", „Ridică copilul", „Primește comms".
- Buton „Adaugă tutore" → modal cu formular.
- Edit inline (click pe tutore → modal pre-populat).
- Delete cu confirmare.
- Tokeni Vector 365, dark-mode, RO.

**`src/lib/api/guardians.ts`**: funcțiile client (listGuardians, addGuardian, updateGuardian, deleteGuardian).

### Integrare nav
- Nu e pagină separată; componenta se montează în profilul/detaliile elevului existent.

## Out of scope
- Auth login pentru tutori (portalul parental e SCHOOL-007).
- Notificări automate la tutori la absențe/note (SCHOOL-003, SCHOOL-002 le au deja; integrarea
  cu câmpul `receivesCommunications` se face în viitor).
- Custodie legală document upload.

## Acceptance criteria
- AC1: Pot adăuga mai mulți tutori pentru un elev (maxim 10); fiecare cu drepturi diferite.
- AC2: Setarea `isPrimary:true` pe un tutore scoate `isPrimary=false` de pe toți ceilalți.
- AC3: Un tutore cu `canPickup:false` are badge-ul „Nu ridică" vizibil în UI.
- AC4: Dacă încerc să adaug al 11-lea tutore → 409 `guardian_limit_reached`.
- AC5: Tot e tenant-scoped: nu văd tutorii elevilor altui tenant.
- AC6: Migrare 0035 committed, no collision; `db:reset && db:seed` trec.

## Tests (Given/When/Then)

- **T-GUARDIAN-001-1** [blocant] Given migrare 0035 aplicată, When `SELECT * FROM student_guardians`,
  Then tabelul există cu coloanele corecte și prefix 0035 > 0034.
- **T-GUARDIAN-001-2** [blocant] Given un elev existent, When `POST /api/students/:id/guardians`
  cu `{fullName:"Maria Ionescu", isPrimary:true}`, Then 201 + guardian creat cu `isPrimary=true`.
- **T-GUARDIAN-001-3** [blocant] Given un elev cu tutorele A (isPrimary=true), When POST tutore B cu
  `isPrimary:true`, Then tutorele A are `isPrimary=false` și B are `isPrimary=true` (verificat în GET).
- **T-GUARDIAN-001-4** [blocant] Given un elev cu 10 tutori, When POST al 11-lea,
  Then 409 `{error:"guardian_limit_reached"}`.
- **T-GUARDIAN-001-5** [blocant] Given serverul pornit, When login + `GET /api/students/:id/guardians`,
  Then 200 `{guardians:[]}` (live API smoke).
- **T-GUARDIAN-001-6** [normal] Given StudentGuardiansPanel, When randat cu mock cu 2 tutori,
  Then se randează fără crash și afișează ambii tutori.

## DoD
Build+typecheck+lint+unit verzi, migrare 0035 committed fără collision, `db:reset`+`db:seed` OK,
API live 200, reviewer APPROVED, persona reports salvate, commit pe `feat/SCHOOL-faza-1-fundatie`.

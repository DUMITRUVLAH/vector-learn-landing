---
id: SCHOOL-007
title: "Portal părinte — vizualizare note, prezență, fișă situație, sold taxe + știri școală"
milestone: SCHOOL
phase: 1
status: pending
depends_on: [SCHOOL-002, SCHOOL-003, SCHOOL-004, GUARDIAN-001]
slug: parent-portal
---

## Goal

Portalul de tip read-only pentru **părinți**. Un utilizator cu rolul `parent` se autentifică și
vede **doar** datele copiilor săi (prin `families.id` legat la `students.familyId`):
note (grade_entries), prezență (school_attendance), fișa de situație (medie per materie per termen),
soldul taxelor (student_tuition / tuition_installments) și alertele/noutățile postate de
administratori (news_posts — tabel nou, simplu).

**Read-only** — părintele nu poate modifica nimic.
**Tenant-safe** — vedeți exclusiv datele din tenant-ul propriu.
**Auth existent** — rolul `parent` există deja în `user_role` enum.

## In scope

### Schema nouă `server/db/schema/schoolNews.ts`
- `school_news_posts`: `id`, `tenantId` (FK cascade), `title varchar(200)`, `body text`,
  `publishedAt timestamp null` (null = draft), `authorId` (FK → users, set null),
  timestamps. Index pe `(tenantId, publishedAt)`.
- Export în `server/db/schema/index.ts`.

### Migrare
- Fișier manual `drizzle/0034_school007_news.sql` (prefix 0034 > max 0033).
  Orice CREATE TYPE wrapat în DO $$ guard.
- Journal `drizzle/meta/_journal.json` actualizat.

### `server/routes/parentPortal.ts`
Toate rutele cer `requireAuth` + verificare `user.role === 'parent'` → 403 dacă nu e parent.

- `GET /api/parent/children` → lista elevilor din familia părintelui
  (students WHERE familyId IN families WHERE payerEmail = user.email OR … logic: family linked via
  `students.familyId` → join to verify `families.tenantId = user.tenantId`; scoped by tenant).
  Răspuns: `{children: [{id, fullName, classId?, className?}]}`.
- `GET /api/parent/children/:studentId/grades?termId=` → grade_entries pentru elev (verificare
  că elevul aparține familiei părintelui logat).
  Răspuns: `{grades: [{subjectName, value, weight, type, gradedAt, title}]}`.
- `GET /api/parent/children/:studentId/attendance?termId=` → school_attendance pentru elev.
  Răspuns: `{attendance: [{date, status, excused, notes}]}`.
- `GET /api/parent/children/:studentId/tuition` → student_tuition + tuition_installments pentru elev.
  Răspuns: `{plan?: {...}, installments: [{dueDate, amountCents, paidAt?, statusLabel}]}`.
- `GET /api/parent/news` → ultimele 20 school_news_posts publicate (publishedAt not null, ≤ acum),
  descrescător; scoped by tenantId.
- `POST /api/school/news` (rol admin/manager) → creare știre/alertă.
- Montat în `server/app.ts`.

### UI

**`src/pages/app/ParentPortalPage.tsx`** la `/app/parent/portal`
- Dashboard cu carduri: lista copiilor + tab-uri per copil (Note / Prezență / Taxe).
- **Tab Note**: tabel materie → medie calculată, lista notelor per termen.
- **Tab Prezență**: sumar (P/A/Î/X %) + tabel zile cu status.
- **Tab Taxe**: plan activ + lista rate cu badge „achitat" / „scadent" / „restant".
- **Panoul Știri**: lista știri/alerte recente (titlu + preview).
- Read-only: fără butoane de acțiune.
- Tokeni Vector 365, dark-mode, RO.

**`src/lib/api/parentPortal.ts`**: funcțiile client.

### Redirectare rol
- La login, dacă `user.role === 'parent'` → redirect la `#/app/parent/portal` (nu la dashboard general).
- Link „Portal" în AppShell vizibil doar pentru `parent`.

## Out of scope
- Plata online direct din portal.
- Mesagerie parinte↔profesor.
- Notificări push.
- Accesul profesorului la date (separat, altă pagină).

## Acceptance criteria
- AC1: Un utilizator cu rol `parent` poate accesa `/api/parent/children` și vede copiii din familia sa.
- AC2: Un utilizator cu rol `parent` NU poate accesa `/api/school/classes` (403 sau datele altora).
- AC3: Notele și prezența sunt filtrate strict pe copilul propriu (alt parent nu le vede).
- AC4: `GET /api/parent/news` returnează știrile publicate, nu draft-urile.
- AC5: ParentPortalPage se randează fără crash cu date mock.
- AC6: Migrare 0034 committed, no collision; `db:reset && db:seed` trec.

## Tests (Given/When/Then)

- **T-SCHOOL-007-1** [blocant] Given migrare 0034 aplicată, When `SELECT * FROM school_news_posts`,
  Then tabelul există cu coloanele corecte și prefix 0034 > 0033.
- **T-SCHOOL-007-2** [blocant] Given un user cu rol `parent`, When `GET /api/parent/children`,
  Then 200 cu lista copiilor familiei (live API smoke).
- **T-SCHOOL-007-3** [blocant] Given un user fără rol `parent` (ex. manager), When `GET /api/parent/children`,
  Then 403 `{error:"forbidden"}`.
- **T-SCHOOL-007-4** [blocant] Given user `parent` cu copilul A, When `GET /api/parent/children/:idAltElev/grades`,
  Then 403 sau 404 (nu vede notele altor elevi).
- **T-SCHOOL-007-5** [normal] Given serverul pornit + login ca parent, When `GET /api/parent/news`,
  Then 200 `{news:[]}` (live API smoke).
- **T-SCHOOL-007-6** [normal] Given ParentPortalPage, When randat cu mock, Then se randează fără crash
  și afișează titlul portalului.

## DoD
Build+typecheck+lint+unit verzi, migrare 0034 committed fără collision, `db:reset`+`db:seed` OK,
API live 200, reviewer APPROVED, persona reports salvate, commit pe `feat/SCHOOL-faza-1-fundatie`.

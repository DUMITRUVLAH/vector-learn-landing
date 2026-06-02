---
id: GAP-015
title: "Teme + misiuni per lecție — creare, listare, submisie elev"
milestone: GAP
phase: 5
priority: P2
slug: homework-assignments
depends_on: [MVP-005]
status: pending
---

# GAP-015 — Teme + misiuni per lecție

## Goal

Profesorul atașează teme (homework) la o lecție. Elevul (sau managerul) poate vedea temele
pentru fiecare lecție și poate marca o temă ca „predată" (submitted). Părinții văd temele
în portalul student. Ușor de folosit, nu un LMS complet.

## In scope

- **Schema nouă:** `lesson_homework` (tenant-scoped)
  - `id uuid pk default, tenant_id, lesson_id FK lessons, title varchar(255) not null,`
  - `description text, due_date date, created_at, created_by (user_id FK)`
- **Schema nouă:** `homework_submissions` (tenant-scoped)
  - `id uuid pk, tenant_id, homework_id FK lesson_homework, student_id FK students,`
  - `submitted_at timestamptz, notes text, created_at`
  - constraint unique (homework_id, student_id)
- **Migrare:** `0032_gap015_homework.sql` — prefix 32, rulează după 31_gap014
- **API routes (toate autentificate, tenant-scoped):**
  - `GET /api/lessons/:lessonId/homework` → array de homework cu nr. submisii
  - `POST /api/lessons/:lessonId/homework` → crează homework; body: `{ title, description?, due_date? }`
  - `DELETE /api/lessons/:lessonId/homework/:id` → șterge (soft: checks no submissions)
  - `POST /api/homework/:id/submit` → body: `{ studentId, notes? }` → upsert submission
  - `GET /api/students/:studentId/homework` → teme per student (cu status: pending/submitted)
- **UI — tab "Teme" pe `/app/lessons` sau pe lecție individuală:**
  - Buton "+ Adaugă temă" (manager/teacher only)
  - Lista teme cu titlu, deadline, nr. elevi care au predat
  - Pe fiecare temă: buton „Marchează ca predat" pentru elev/manager
- **UI — tab "Teme" pe `/app/students/:id`:**
  - Lista temelor studenților cu status `pending | submitted` și deadline
  - Buton „Predă" → POST submit
- **DB:** fără raw `.execute().rows`; query builder sau `Array.isArray(r) ? r : r.rows`
- **TypeScript strict:** zero `any`

## Out of scope

- File upload / atașamente
- Grading/notare pe temă (pentru GAP-012 / SCHOOL-002)
- Notificări automate la temă nouă (COMM mai târziu)
- Portal public student (GAP-010 are sesiunea proprie)

## Acceptance criteria

- [ ] `GET /api/lessons/:lessonId/homework` → 200 cu array (poate fi gol)
- [ ] `POST /api/lessons/:lessonId/homework` → 201 cu homework creat
- [ ] `POST /api/homework/:id/submit` → 201; al doilea call → 200 (upsert, nu 409)
- [ ] `GET /api/students/:studentId/homework` → array cu `status: pending|submitted`
- [ ] Tab "Teme" pe lessons page randează fără crash
- [ ] Tab "Teme" pe student page randează cu status corect
- [ ] Migrare `0032_gap015_homework.sql` commitată; `db:reset + db:seed` succed
- [ ] TypeScript strict; zero `any`; 0 axe critical/serious

## Tests

- **T-GAP-015-1** `[blocant]` Given lecție existentă, When `POST /api/lessons/:id/homework` cu titlu valid, Then 201 + homework în DB cu tenant_id corect
- **T-GAP-015-2** `[blocant]` Given homework existent, When `POST /api/homework/:id/submit` cu studentId, Then 201 + submission creat; al doilea call → 200 (upsert)
- **T-GAP-015-3** `[blocant]` Given student cu teme, When `GET /api/students/:studentId/homework`, Then lista cu câmp `status` corect (pending/submitted)
- **T-GAP-015-4** `[blocant]` Migration gate: `db:reset + db:seed` succed; `0032_gap015_homework.sql` prezent
- **T-GAP-015-5** `[blocant]` API smoke: login + `GET /api/lessons/<id>/homework` → 200 JSON array
- **T-GAP-015-6** `[normal]` Tab "Teme" pe lessons page randează fără crash (smoke render)
- **T-GAP-015-7** `[normal]` Tab "Teme" pe student page afișează status `pending` sau `submitted` corect

## DoD

Standard CLAUDE.md §0.2. Faza 5 branch: `feat/GAP-faza-5-operational`. Un PR per fază.

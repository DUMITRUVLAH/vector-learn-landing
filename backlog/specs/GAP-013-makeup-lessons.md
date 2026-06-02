---
id: GAP-013
title: "Lecții de recuperare + credite de anulare"
milestone: GAP
phase: 4
priority: P2
slug: makeup-lessons
depends_on: [MVP-005, SCHED-501]
status: pending
---

# GAP-013 — Lecții de recuperare + credite de anulare

## Goal

Când o lecție este anulată de teacher sau de student, sistemul generează automat un credit
de recuperare. Studentul (sau managerul) poate rezerva o lecție de recuperare consumând
creditul, fără re-plată.

## In scope

- **Schema nouă:** `makeup_credits` (tenant-scoped)
  - `id, tenant_id, student_id, lesson_id (lecția anulată — trigger), expires_at, used_at, makeup_lesson_id (nullable), reason, created_at`
- **Credit automat:** când o `studentLessons.attendanceStatus` se schimbă în `excused` SAU
  când `lessons.status` devine `cancelled`, se creează un `makeup_credits` row dacă studentul
  era înscris la lecție.
- **Booking recuperare:** `POST /api/makeup/book` — body: `{ creditId, lessonId }` → marchează
  creditul ca folosit, înscrie studentul la noua lecție (upsert în `student_lessons`), returnează
  `makeup_lesson_id`.
- **Listing credite per student:** `GET /api/makeup/credits?studentId=` → array de credite cu
  status: `available | used | expired`.
- **UI:** tab "Recuperări" pe `/app/students/:id` — credite disponibile + buton „Rezervă lecție
  de recuperare" (modal: selector de lecție din viitor, același curs/teacher).
- **Expirare credite:** `expires_at = created_at + 30 zile` (configurabil per tenant în viitor).
  Credite expirate rămân în DB, status `expired`.
- **Endpoints autentificate:**
  - `GET /api/makeup/credits?studentId=` — lista creditelor unui student
  - `POST /api/makeup/book` — rezervă recuperare
  - `GET /api/makeup/available-lessons?studentId=&creditId=` — lecții viitoare din același curs
- **DB:** fără raw `.execute().rows`

## Out of scope

- Notificări automate (email/push) la generarea creditului (COMM-206 dacă necesar)
- Recuperare inter-cursuri (diferit teacher/course)
- Rambursare cash la credit nefolosit

## Acceptance criteria

- [ ] Credit generat automat când lecție `cancelled` sau attendance `excused`
- [ ] `GET /api/makeup/credits?studentId=` → lista cu status corect
- [ ] `POST /api/makeup/book` → credit marcat `used`, student înscris la noua lecție
- [ ] Tab "Recuperări" pe student page funcțional cu modal
- [ ] Migrare `makeup_credits` commitată; `db:reset + db:seed` succed
- [ ] Credite expirate (> 30 zile) au status `expired` în listing
- [ ] TypeScript strict; zero `any`; 0 axe critical/serious

## Tests

- **T-GAP-013-1** `[blocant]` Given lecție `cancelled` cu student înscris, When sistem procesează, Then `makeup_credits` creat automat pentru student
- **T-GAP-013-2** `[blocant]` Given credit disponibil, When `POST /api/makeup/book` cu lecție validă, Then 201 + credit `used_at` setat + student_lesson creat
- **T-GAP-013-3** `[blocant]` Given credit deja folosit, When `POST /api/makeup/book` din nou, Then 409
- **T-GAP-013-4** `[blocant]` Migration gate: `db:reset + db:seed` succed
- **T-GAP-013-5** `[normal]` Given credit vechi de 31 zile, When `GET /api/makeup/credits?studentId=`, Then status = `expired`
- **T-GAP-013-6** `[normal]` Tab "Recuperări" randează fără crash

## DoD

Standard. O fază = 1 PR (CLAUDE.md §0.2). Faza 4 branch: `feat/GAP-faza-4-analytics`.

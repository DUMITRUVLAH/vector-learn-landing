---
id: GAP-005
title: Rezervă grupă (lista de așteptare)
milestone: GAP
phase: 2
priority: MEDIUM
status: pending
dependencies: [courses, students, student_lessons, COMM-205]
feeds_into: [GAP-004, GAP-010]
branch: feat/GAP-faza-2-abonamente-waitlist
---

## Scop

Când o grupă e la capacitate maximă, un student poate fi pus în rezervă. La eliberarea unui loc, primul din rezervă e notificat și are 48h să confirme înrolarea.

## User stories

- Ca manager, vreau să adaug un student pe lista de așteptare a unei grupe pline.
- Ca student, vreau să primesc notificare automată când apare un loc liber.

## Criterii de acceptare

- [ ] Câmp `max_students integer null` adăugat pe `courses` (null = fără limită)
- [ ] Tabel `course_waitlist`: `id`, `tenantId`, `courseId` FK, `studentId` FK, `position integer`, `notifiedAt timestamp null`, `confirmedAt timestamp null`, `expiresAt timestamp null`, `createdAt`, `updatedAt`
- [ ] `POST /api/courses/:id/waitlist` → adaugă student în lista de așteptare cu poziție auto-incrementată
- [ ] `GET /api/courses/:id/waitlist` → returnează lista ordonată după poziție
- [ ] La scăderea sub capacitate maximă (un student leaves), sistemul notifică primul pe waitlist (COMM-205) și setează `expiresAt = now() + 48h`
- [ ] `POST /api/waitlist/:id/confirm` → creează `student_lessons` și elimină din waitlist
- [ ] Dacă `confirmedAt` nu e setat înainte de `expiresAt`, poziția expiră (lazy check sau cron)
- [ ] Pagina cursului sau StudentsPage afișează nr. de persoane în așteptare

## Fișiere implicate

- `server/db/schema/courses.ts` — `maxStudents`
- `server/db/schema/` — tabel nou `course_waitlist`
- `server/routes/courses.ts` — endpoints waitlist
- `src/pages/app/StudentsPage.tsx` sau pagina curs — afișare waitlist

## Teste

- Unit: `POST /waitlist` adaugă cu poziție corectă
- Unit: la eliberare loc → notificare creată în COMM-205 queue
- Unit: expirare poziție după `expiresAt`

## DoD

Build + typecheck + lint + teste verzi. `db:reset && db:seed` trece. PR pe branch `feat/GAP-faza-2-abonamente-waitlist`.

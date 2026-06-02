---
id: COURSE-202
title: "Grupe cu capacitate maximă și waitlist"
milestone: COURSE
phase: "2"
status: pending
depends_on: [COURSE-201]
slug: groups-capacity
---

## Goal

Adaugă câmpul `maxStudents` pe tabela `groups` (sau creează tabela dacă nu există ca entitate separată).
Când o grupă este plină (enrolled == max), înrolarea se blochează și elevul e adăugat la waitlist.
Managerul vede gradul de ocupare (e.g. "6/8 elevi") în lista de grupe.

**Reuse obligatoriu:**
- Tabela `groups` dacă există deja din COURSE-102 (verifică schema).
- Pattern COURSE-103 pentru enrollment logic.

## In scope

### Schema changes (migrare nouă)
- Dacă `groups` există: adaugă `max_students INTEGER NOT NULL DEFAULT 20`
- Dacă `groups` nu există: creează cu `id, tenant_id, course_id, name, teacher_id, max_students, status`.
- Tabelă `group_waitlist`: `id, tenant_id, group_id, student_id, created_at`.

### Backend
- `POST /api/groups/:id/enroll` — verifică count actual vs max_students:
  - Dacă loc disponibil: insert în `group_enrollments` (sau `studentLessons` dacă acel flux).
  - Dacă plin: insert în `group_waitlist`, răspuns 202 `{ status: "waitlisted" }`.
- `GET /api/groups/:id/capacity` — returnează `{ enrolled: N, max: M, waitlisted: W }`.
- `DELETE /api/groups/:id/enroll/:studentId` — scoate elevul din grupă; dacă există pe waitlist, primul
  e auto-promovat + notificat (log în `notifications` sau `student_notes`).

### Frontend — UI simplă
- Badge "6/8" pe card-ul grupei (în lista de grupe).
- Buton "Înrolează" disabled când plin, cu tooltip "Grupă plină — va fi adăugat pe waitlist".
- Confirm dialog pentru waitlist.

## User stories
- Ca **Manager**, vreau să setez maxim 8 elevi la "Engleză B2 Mar/Joi" pentru că sala are 8 locuri.
- Ca **Recepționer**, vreau ca sistemul să mă avertizeze când grupa este plină și să ofere waitlist automat.
- Ca **Manager**, vreau să văd câți elevi sunt înrolați vs maximum pentru fiecare grupă.
- Ca **Manager**, vreau ca primul de pe waitlist să fie auto-promovat când cineva se dezînrolează.

## Acceptance criteria
- AC1: `groups.max_students` există în schema cu default 20.
- AC2: POST /api/groups/:id/enroll când plin → 202 `{ status: "waitlisted" }`.
- AC3: GET /api/groups/:id/capacity returnează `{ enrolled, max, waitlisted }`.
- AC4: Dezînrolare când există waitlist → primul de pe waitlist este promovat.
- AC5: Badge cu gradul de ocupare vizibil în UI.
- AC6: Build+typecheck+lint curate.

## Tests (Given/When/Then)
- **T-COURSE-202-1** [blocant] Given grupă cu max_students=2 și 2 înrolați, When POST enroll student 3, Then 202 `{ status: "waitlisted" }`.
- **T-COURSE-202-2** [blocant] Given grupă cu loc liber, When POST enroll, Then 201 `{ status: "enrolled" }`.
- **T-COURSE-202-3** [blocant] Given 1 pe waitlist, When DELETE enroll student 1, Then waitlistul primul devine enrolled.
- **T-COURSE-202-4** [blocant] Given GET /api/groups/:id/capacity, Then shape `{ enrolled: N, max: M, waitlisted: W }`.
- **T-COURSE-202-5** [normal] Given build, When `npm run build`, Then zero erori TypeScript.
- **T-COURSE-202-6** [blocant] Given migrare run, When `npm run db:reset && npm run db:seed`, Then succes.

## DoD
Build+typecheck+lint curate, tests verzi, reviewer APPROVED, persona reports salvate,
commit pe `feat/COURSE-faza-2-edit-archive`.

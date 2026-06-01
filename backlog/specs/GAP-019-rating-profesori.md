---
id: GAP-019
title: Rating profesori (configurat per tenant)
milestone: GAP
phase: 6
priority: LOW
status: pending
dependencies: [teachers, feedback, students]
feeds_into: [GAP-010]
branch: feat/GAP-faza-6-gamificare
---

## Scop

Sistem de rating 1–5 stele per profesor, colectat de la studenți după lecții. Ratingul mediu apare pe profilul profesorului. Ajută la decizii de alocare și la feedback structural.

## Criterii de acceptare

- [ ] Tabel `teacher_ratings`: `id uuid PK`, `tenantId uuid FK`, `teacherId uuid FK → teachers`, `studentId uuid FK → students`, `lessonId uuid FK null → lessons`, `score smallint CHECK (score BETWEEN 1 AND 5)`, `comment varchar(500) null`, `createdAt`
- [ ] `GET /api/teachers/:id/rating` returnează `{ avg: float, count: int, recent: [{ score, comment, createdAt }] }`
- [ ] Ratingul mediu vizibil pe TeachersPage și TeacherStatsPage
- [ ] Solicitare rating trimisă prin COMM-205 la N ore după lecție (configurat în Settings → HR)
- [ ] Tenant poate activa/dezactiva rating din Settings → HR → Rating profesori
- [ ] Un student poate da un singur rating per lecție per profesor

## Fișiere implicate

- `server/db/schema/teacher_ratings.ts` — tabel nou
- `server/routes/teachers.ts` — endpoint rating
- `src/pages/app/TeachersPage.tsx` — rating mediu afișat
- `src/pages/app/TeacherStatsPage.tsx` — rating mediu + recent

## Teste

- Unit: `GET /api/teachers/:id/rating` calculează avg corect
- Unit: student nu poate da două ratinguri per lecție → 409
- Smoke: TeachersPage afișează ratingul fără crash

## DoD

Build + typecheck + lint + teste verzi. Migrare comisă. PR pe branch `feat/GAP-faza-6-gamificare`.

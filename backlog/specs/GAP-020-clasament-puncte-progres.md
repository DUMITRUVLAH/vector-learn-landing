---
id: GAP-020
title: Clasament elevi și sistem de puncte de progres
milestone: GAP
phase: 6
priority: LOW
status: pending
dependencies: [students, student_lessons, schoolGrades, COMM-205]
feeds_into: [GAP-010]
branch: feat/GAP-faza-6-gamificare
---

## Scop

Elevi câștigă puncte pentru prezență, note, recuperare. Clasament vizibil per grupă în portalul studentului. Motivează prezența și reduce abandonul timpuriu, util în special pentru copii și adolescenți.

## Criterii de acceptare

- [ ] Tabel `student_points`: `id uuid PK`, `tenantId uuid FK`, `studentId uuid FK → students`, `points integer NOT NULL`, `reason enum('attendance','grade','recovery','bonus')`, `refId uuid null`, `createdAt`
- [ ] La marcarea prezentei `present` (SCHED-503 hook), se adaugă automat 1 punct cu `reason: 'attendance'`, `refId: lessonId`
- [ ] `GET /api/students/:id/points?termId=` returnează suma punctelor și istoricul
- [ ] `GET /api/courses/:id/leaderboard` returnează top studenți din grupă cu punctaj, sortat descendent
- [ ] Clasamentul e anonimizat implicit (afișează „Student #3"), cu opțiunea de a afișa numele (configurat per tenant)
- [ ] Clasamentul vizibil în portalul student GAP-010 (tab Clasament, afișat dacă feature e activ)
- [ ] Tenant poate activa/dezactiva gamificarea din Settings

## Fișiere implicate

- `server/db/schema/student_points.ts` — tabel nou
- `server/routes/students.ts` — endpoint points + leaderboard
- `server/routes/lessons.ts` — hook la attendance pentru adăugare punct
- `src/pages/app/StudentPortalPage.tsx` — tab Clasament (dacă GAP-010 implementat)

## Teste

- Unit: marcaj `present` → 1 punct adăugat cu refId corect
- Unit: lecție trial → puncte NU se adaugă
- Unit: `GET /courses/:id/leaderboard` returnează studenți sortați corect
- Unit: anonimizare corectă când `showNames = false`

## DoD

Build + typecheck + lint + teste verzi. Migrare comisă. PR pe branch `feat/GAP-faza-6-gamificare`.

---
id: GAP-007
title: Deducere automată din sold unități la prezență marcată
milestone: GAP
phase: 2
priority: HIGH
status: pending
dependencies: [GAP-006, SCHED-503]
feeds_into: [GAP-008, GAP-010]
branch: feat/GAP-faza-2-abonamente-waitlist
---

## Scop

Hook declanșat la marcarea prezentei `present` — dacă studentul are un pachet activ pentru grupă, scade 1 unitate atomic. Elimină număratul manual al lecțiilor din pachete.

## Criterii de acceptare

- [ ] La `PATCH /api/lessons/:id/students/:studentId/attendance` cu `{ status: "present" }`, dacă există `lesson_packages` activ pentru `(studentId, courseId)`, se scade `unitsRemaining` cu 1 în aceeași tranzacție DB
- [ ] Dacă studentul are mai multe pachete active pentru aceeași grupă, se consumă cel mai vechi (FIFO pe `validFrom`)
- [ ] Dacă nu există pachet activ, marcarea prezentei reușește fără eroare (comportament unchanged)
- [ ] Lecțiile cu `is_trial = true` (GAP-003) **nu** declanșează deducerea
- [ ] Deducerea e logată în `audit_log` cu `{ action: "unit_deducted", packageId, studentId, lessonId }`
- [ ] La `unitsRemaining = 0` după deducere, pachetul primește `status: 'exhausted'` și se creează alertă COMM-205
- [ ] Dacă marcarea e schimbată din `present` înapoi în `absent`, unitatea e readăugată (reverse deduction)

## Fișiere implicate

- `server/routes/lessons.ts` (sau `student-lessons.ts`) — hook la PATCH attendance
- `server/db/schema/lesson_packages.ts` — update `unitsRemaining`
- `server/db/schema/auditLog.ts` — log deducere

## Teste

- Unit: marcaj `present` → `unitsRemaining` scade cu 1 atomic
- Unit: marcaj pe lecție trial → `unitsRemaining` neschimbat
- Unit: fără pachet activ → marcaj reușește, fără eroare
- Unit: FIFO — se consumă pachetul cu `validFrom` mai vechi
- Unit: reverse deduction la schimbare `present` → `absent`

## DoD

Build + typecheck + lint + teste verzi. PR pe branch `feat/GAP-faza-2-abonamente-waitlist`.

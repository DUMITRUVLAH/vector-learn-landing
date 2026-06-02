---
id: GAP-014
title: Salarizare bazată pe prezența efectivă (tarif per elev prezent)
milestone: GAP
phase: 4
priority: MEDIUM
status: pending
dependencies: [payrollEntries, SCHED-503, teachers, HR-401]
feeds_into: []
branch: feat/GAP-faza-4-analytics
---

## Scop

Extinde HR-401 cu un al doilea model de tarifare: tarif per elev prezent (în loc de tarif orar). Necesar pentru centre de dans, muzică, sport.

## Criterii de acceptare

- [ ] Câmp `payrollModel enum('hourly','per_student') default 'hourly'` adăugat pe `teachers`
- [ ] Câmp `ratePerStudentCents integer null` adăugat pe `teachers`
- [ ] La `POST /api/payroll/generate`, dacă `payrollModel = 'per_student'`: calcul = `COUNT(student_lessons WHERE attendanceStatus='present' AND lessonId=...) × ratePerStudentCents` per lecție
- [ ] `breakdown` jsonb include `studentsPresent: N` per lecție pentru transparență
- [ ] Lecțiile trial (GAP-003, `is_trial=true`) **nu** intră în calculul per-student
- [ ] UI PayrollPage afișează modelul de tarifare ales per profesor
- [ ] Editare `payrollModel` și `ratePerStudentCents` pe cardul profesorului în TeachersPage

## Fișiere implicate

- `server/db/schema/teachers.ts` — `payrollModel`, `ratePerStudentCents`
- `server/routes/payroll.ts` — logică calcul per-student
- `src/pages/app/PayrollPage.tsx` — afișare model
- `src/pages/app/TeachersPage.tsx` — editare model

## Teste

- Unit: calcul `per_student` corect (N elevi × rată)
- Unit: lecții trial excluse din calcul
- Unit: `hourly` model unchanged

## DoD

Build + typecheck + lint + teste verzi. PR pe branch `feat/GAP-faza-4-analytics`.

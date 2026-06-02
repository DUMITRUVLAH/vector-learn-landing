---
id: GAP-004
title: Conversie automată trial → student activ + înrolare grupă
milestone: GAP
phase: 1
priority: HIGH
status: pending
dependencies: [GAP-003, CRM-111, courses, student_lessons]
feeds_into: [GAP-006, GAP-005]
branch: feat/GAP-faza-1-trial-flow
---

## Scop

Acțiunea „Convertește din trial" pe lead card face atomic: creează studentul, îl înscrie în grupă pentru toate lecțiile viitoare, marchează lead-ul convertit. Extinde CRM-111 cu pasul de înrolare în grupă.

## User stories

- Ca manager, vreau să apăs un singur buton pe cardul lead-ului și să am studentul creat + înrolat în grupă, fără 4 pași manuali.

## Criterii de acceptare

- [ ] `POST /api/leads/:id/convert-trial` acceptă `{ courseId: "uuid", createPackage?: boolean }` și returnează `{ studentId, enrolledLessons: N }`
- [ ] Operația e atomică: dacă înrolarea eșuează, studentul nu e creat (rollback)
- [ ] Studentul apare imediat în `student_lessons` pentru toate lecțiile viitoare (status `scheduled`) din seria cursului
- [ ] Lead-ul primește `converted_to_student_id` și `converted_at` (refolosește câmpurile din CRM-111)
- [ ] Dacă `createPackage: true`, se creează un `lesson_package` (GAP-006) cu `unitsTotal` = valoarea implicită configurată pe curs (sau 10 dacă nu e configurată)
- [ ] Buton „Convertește din trial" e vizibil pe Lead Card doar dacă lead-ul are cel puțin o lecție trial marcată (`is_trial = true` cu `trialLeadId = leadId`)
- [ ] Dacă lead-ul e deja convertit (`converted_to_student_id` nenul), butonul e dezactivat cu tooltip „Deja convertit"

## Fișiere implicate

- `server/routes/leads.ts` — endpoint `POST /:id/convert-trial`
- `server/db/schema/student_lessons.ts` — înrolare bulk
- `src/pages/app/LeadCardPage.tsx` — buton Convertește + confirmare modal

## Teste

- Unit: endpoint creează student + student_lessons în tranzacție
- Unit: rollback dacă courseId invalid
- Unit: lead deja convertit → 409 Conflict
- Smoke: butonul e vizibil pe lead cu trial marcat

## DoD

Build + typecheck + lint + teste verzi. PR pe branch `feat/GAP-faza-1-trial-flow`.

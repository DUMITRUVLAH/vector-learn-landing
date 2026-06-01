---
id: GAP-002
title: Potrivire automată grupă
milestone: GAP
phase: 1
priority: HIGH
status: pending
dependencies: [GAP-001, courses, lessons, student_lessons, teachers, availability]
feeds_into: [GAP-003, GAP-005]
branch: feat/GAP-faza-1-trial-flow
---

## Scop

La acțiunea „Găsește grupă" pe cardul unui lead, sistemul propune grupe compatibile cu disciplina, nivelul, filiala, vârsta și slotul preferat din GAP-001. Elimină 15–30 min de muncă manuală per prospect.

## User stories

- Ca manager, vreau să apăs „Găsește grupă" pe un lead și să văd imediat top 5 grupe disponibile compatibile cu preferințele lui.
- Ca manager, vreau să pot crea o lecție trial direct din lista de sugestii.

## Criterii de acceptare

- [ ] `GET /api/courses/match?leadId=:id&tenantId=:tid` returnează array de max 5 grupe cu `{ courseId, courseName, teacherName, nextSlot, compatibilityScore, vacancies }`
- [ ] Scorarea: disciplina match (obligatoriu, altfel exclus), nivel match (+2), slot preferat exact (+3), zi preferată (+2), locuri libere > 0 (obligatoriu)
- [ ] Grupele fără locuri libere sunt excluse (sau incluse cu `vacancies: 0` și badge „Lista de așteptare" dacă GAP-005 e prezent)
- [ ] Buton „Găsește grupă" pe Lead Card (`/app/leads/:id`) deschide un panel lateral cu sugestiile
- [ ] Din panel, buton „Programează trial" creează direct o lecție trial (GAP-003 — dacă nu e implementat, butonul e disabled cu tooltip)
- [ ] Endpoint e protejat de autentificare și scoped la tenantId

## Fișiere implicate

- `server/routes/courses.ts` — endpoint `GET /match`
- `server/db/schema/courses.ts` — verifică câmpurile necesare (discipline, level, maxStudents)
- `src/pages/app/LeadCardPage.tsx` — buton + panel sugestii

## Teste

- Unit: endpoint returnează grupe sortate corect după scor
- Unit: grupe fără locuri libere nu apar în rezultate
- Unit: lead fără disciplină setată → returnează array gol, nu eroare 500
- Smoke: panel se deschide și afișează lista

## DoD

Build + typecheck + lint + teste verzi. PR pe branch `feat/GAP-faza-1-trial-flow`.

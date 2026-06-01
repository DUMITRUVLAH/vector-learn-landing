---
id: GAP-001
title: Slot preferat orar pe lead/student
milestone: GAP
phase: 1
priority: HIGH
status: pending
dependencies: [leads, students, CRM-106]
feeds_into: [GAP-002, GAP-003]
branch: feat/GAP-faza-1-trial-flow
---

## Scop

Lead-ul sau studentul poate declara ziua săptămânii și intervalul orar preferat. Informația e stocată și folosită de motorul de potrivire grupă (GAP-002).

## User stories

- Ca manager, vreau să știu când e disponibil un lead ca să-i propun o grupă compatibilă.
- Ca lead, vreau să declar „Marți 17:00–19:00" o dată și sistemul să-mi găsească automat o grupă.

## Criterii de acceptare

- [ ] Coloane `preferred_days` (jsonb array of int 1–7, luni=1) și `preferred_time_start` / `preferred_time_end` (time without tz) adăugate pe `leads` și `students` printr-o migrare Drizzle
- [ ] `PATCH /api/leads/:id` acceptă `{ preferredDays: [2,4], preferredTimeStart: "17:00", preferredTimeEnd: "19:00" }` fără a rupe celelalte câmpuri
- [ ] `PATCH /api/students/:id` acceptă aceleași câmpuri
- [ ] Lead Card (pagina `/app/leads/:id`) afișează un selector vizual „Zile preferate" (checkboxes Luni–Duminică) + input interval orar
- [ ] Câmpul e vizibil și editabil pe cardul studentului din StudentsPage
- [ ] Migrarea e numerotată corect (prefix > max prefix pe main), `db:reset && db:seed` trece

## Fișiere implicate

- `server/db/schema/leads.ts` — adaugă coloane
- `server/db/schema/students.ts` — adaugă coloane
- `server/routes/leads.ts` — acceptă noile câmpuri la PATCH
- `server/routes/students.ts` — acceptă noile câmpuri la PATCH
- `src/pages/app/LeadCardPage.tsx` — UI selector slot preferat
- `src/pages/app/StudentsPage.tsx` — UI slot preferat pe card student
- `drizzle/XXXX_gap001_preferred_schedule.sql` — migrarea generată

## Teste

- Unit: `PATCH /api/leads/:id` salvează și returnează `preferredDays`, `preferredTimeStart`, `preferredTimeEnd`
- Unit: câmpurile sunt nullable — un lead fără slot preferat nu returnează eroare
- Smoke: Lead Card renderizează selectorul fără crash

## DoD

Build + typecheck + lint + teste verzi. Migrare comisă. PR deschis pe branch `feat/GAP-faza-1-trial-flow`.

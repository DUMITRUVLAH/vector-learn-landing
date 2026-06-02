---
id: INTEG-202
title: ContractsPage — picker curs real (contracts.courseId FK)
milestone: INTEG
phase: "2"
branch: feat/INTEG-faza-2-ux-cross-module
status: pending
attempts: 0
depends_on: [INTEG-101]
---

## Goal

Câmpul "Cursul" din contracte este un `<input type="text">` liber. Nu există nicio legătură cu entitatea `courses`. Adăugăm `courseId FK` pe contracts și înlocuim input-ul cu un selector real.

## User stories

- Ca manager, când creez un contract, vreau să selectez cursul dintr-o listă, pentru că nu pot greși numele cursului.
- Ca sistem, vreau că contractele să fie legate de cursuri reale prin FK, pentru că pot raporta câte contracte per curs.

## Acceptance criteria

1. Migrare `0036_integ202_contracts_course.sql` adaugă:
   - `course_id UUID REFERENCES courses(id) ON DELETE SET NULL` pe tabela `contracts`
   - Nullable (câmpul `course varchar` rămâne ca snapshot text pentru PDF)

2. Schema drizzle `server/db/schema/contracts.ts` include `courseId`.

3. Route `server/routes/contracts.ts`:
   - `createContractSchema` și `updateContractSchema` acceptă opțional `courseId`
   - La salvare, dacă `courseId` e furnizat, copiază și `courses.name` în câmpul `course` (snapshot)
   - `GET /api/contracts` returnează `courseId` și `courseName`

4. Frontend `src/pages/app/ContractsPage.tsx` (linia ~555):
   - Câmpul "Cursul" devine `<select>` populat de `GET /api/courses`
   - Label = `courses.name`, valoare = `courses.id`
   - Câmpul text `course` se populează automat din selecție

5. Migrare fără erori.

## Files touched

- `server/db/schema/contracts.ts`
- `server/routes/contracts.ts`
- `src/pages/app/ContractsPage.tsx`
- `src/lib/api/contracts.ts`
- `drizzle/` — migrare `0036_integ202_...`

## Tests

- Unit: `contracts.courseId` se salvează corect
- Unit: `course` snapshot se populează din `courses.name`
- Integration: `POST /api/contracts` cu `courseId` → 201

## DoD

- [ ] Migrare generată și committată
- [ ] `db:reset && db:seed` trece
- [ ] Selector curs funcțional în UI
- [ ] Snapshot `course` text se populează automat
- [ ] Tests verzi

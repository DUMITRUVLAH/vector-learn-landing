---
id: INTEG-101
title: leads.courseId + leads.branchId FK — curs și filială pe lead
milestone: INTEG
phase: "1"
branch: feat/INTEG-faza-1-conectivitate-module
status: pending
attempts: 0
depends_on: [BRANCH-701]
---

## Goal

Lead-ul trebuie să poată fi asociat unui curs real (entitate FK) și unei filiale. Acum `leads.interestCourse` este un câmp text liber — nu există nicio legătură cu tabela `courses`. La fel, `leads` nu are `branchId`, deci un manager de filială vede leads din toate filialele.

## User stories

- Ca manager CRM, vreau să selectez cursul de interes al unui lead dintr-o listă de cursuri reale, pentru că pot ulterior genera rapoarte „câți leads per curs".
- Ca director de filială, vreau să văd doar leads-urile filialei mele, pentru că nu mă interesează celelalte filiale.
- Ca sistem, vreau că la conversia unui lead în student, `courseId`-ul din lead să fie propagat mai departe (cohortă, invoică), pentru că evit datele orfane.

## Acceptance criteria

1. Migrare `0033_integ101_leads_course_branch.sql` adaugă:
   - `course_id UUID REFERENCES courses(id) ON DELETE SET NULL` pe tabela `leads`
   - `branch_id UUID REFERENCES branches(id) ON DELETE SET NULL` pe tabela `leads`
   - Ambele nullable (backward compatible cu rânduri existente)

2. Schema drizzle `server/db/schema/leads.ts` include `courseId` și `branchId` cu relații corecte.

3. Route `server/routes/leads.ts`:
   - `createLeadSchema` și `updateLeadSchema` acceptă opțional `courseId` și `branchId`
   - `GET /api/leads` aplică `withBranchFilter` pe `branchId` (același pattern ca `students`)
   - `POST /api/leads` salvează `courseId` și `branchId`
   - `PUT /api/leads/:id` actualizează `courseId` și `branchId`

4. Frontend `src/pages/app/LeadCardPage.tsx`:
   - Câmpul "Curs de interes" devine `<select>` populat de `GET /api/courses?branchId=...`
   - Afișează `courses.name` ca label, trimite `courses.id` ca valoare
   - Rămâne și câmpul `interestCourse` (text) pentru fallback/notițe manuale — afișat ca "Alte mențiuni curs"
   - Valoarea `courseId` se salvează la `PATCH /api/leads/:id`

5. `GET /api/leads` returnează `courseId` (UUID) și `courseName` (join cu `courses`) în response.

6. Migrare rulează fără erori: `npm run db:generate` → zero fișiere necommitted, `npm run db:reset && npm run db:seed` → succes.

## Files touched

- `server/db/schema/leads.ts` — adaugă `courseId`, `branchId`
- `server/routes/leads.ts` — scheme + withBranchFilter + return courseId/courseName
- `src/pages/app/LeadCardPage.tsx` — înlocuiește input text cu select curs
- `src/lib/api/leads.ts` — actualizează tipul `Lead` cu `courseId`, `branchId`, `courseName`
- `drizzle/` — migrare nouă `0033_integ101_...`

## Tests

- Unit: `leads.courseId` se salvează și se returnează corect
- Unit: `GET /api/leads` cu branch filter returnează doar leads-urile acelei filiale
- Integration: `POST /api/leads` cu `courseId` valid → `courseId` persistat în DB
- Integration: `POST /api/leads` cu `courseId` invalid UUID → 400 Bad Request

## DoD

- [ ] Migrare generată și committată
- [ ] `db:reset && db:seed` trece
- [ ] TypeScript strict — zero `any`
- [ ] `LeadCardPage` afișează selector curs populat cu date reale
- [ ] Tests verzi

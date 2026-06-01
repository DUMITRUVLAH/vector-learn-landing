---
id: INTEG-201
title: Lead→cohort auto-enroll la conversie — CRM conectat cu CX
milestone: INTEG
phase: "2"
branch: feat/INTEG-faza-2-ux-cross-module
status: pending
attempts: 0
depends_on: [INTEG-101, INTEG-103]
---

## Goal

Când un lead se convertește în student, nu există nicio modalitate de a-l înscrie direct într-o cohortă. Managerul trebuie să meargă manual în CX și să-l adauge. Implementăm auto-enroll opțional: la conversie, dacă se specifică un `cohortId`, se creează automat un `cohort_participants` row.

## User stories

- Ca manager CRM, când convertesc un lead în student, vreau să pot selecta cohorta în care se înscrie direct din dialogul de conversie, pentru că evit 2 pași manuali.
- Ca sistem, vreau că dacă lead-ul are `courseId` setat, să îmi sugerez cohortele active pentru acel curs, pentru că reduce erorile de asociere.

## Acceptance criteria

1. `convertLeadSchema` în `server/routes/leads.ts` (linia ~735) acceptă opțional:
   ```ts
   cohortId: z.string().uuid().optional().nullable()
   ```

2. Handler-ul `POST /api/leads/:id/convert` — după crearea studentului, dacă `body.cohortId` e prezent:
   - Inserează în `cohort_participants`:
     ```ts
     {
       tenantId,
       cohortId: body.cohortId,
       studentId: newStudent.id,
       fullName: newStudent.fullName,
       source: 'crm',
       paymentStatus: null,
       amountCents: 0,
     }
     ```
   - Dacă inserarea eșuează (cohortă inexistentă, student deja înscris), conversia continuă — eroarea se loghează dar nu blochează studentul.

3. Frontend `LeadCardPage.tsx` — dialogul de conversie include:
   - Un selector "Înscrie în cohortă (opțional)"
   - Populat de `GET /api/cohorts?courseId=<lead.courseId>&status=active`
   - Dacă lead-ul nu are `courseId`, selectorul afișează toate cohortele active
   - Valoarea selectată se trimite ca `cohortId` în `POST /api/leads/:id/convert`

4. Response-ul `POST /api/leads/:id/convert` include:
   ```json
   { "studentId": "...", "cohortParticipantId": "..." | null }
   ```

5. Nicio migrare nouă necesară (tabelele există deja).

## Files touched

- `server/routes/leads.ts` — `convertLeadSchema` + insert cohort_participants
- `src/pages/app/LeadCardPage.tsx` — dialog conversie + selector cohortă
- `src/lib/api/leads.ts` — actualizează `ConvertLeadPayload`

## Tests

- Unit: conversie cu `cohortId` valid → `cohort_participants` row creat
- Unit: conversie fără `cohortId` → student creat, fără cohort row, fără eroare
- Unit: conversie cu `cohortId` invalid → student creat, eroare logată, fără 500
- Integration: smoke — `POST /api/leads/:id/convert` cu cohortId → 200

## DoD

- [ ] `convertLeadSchema` acceptă `cohortId` opțional
- [ ] Auto-enroll funcționează end-to-end
- [ ] Dialog conversie afișează selector cohortă
- [ ] Tests verzi

---
id: INTEG-201
title: "Integrare UX: auto-enroll lead→cohortă la conversie (lead.courseId→cohortParticipants)"
milestone: INTEG
phase: 2
status: in_progress
depends_on: [CRM-111, CX-703, INTEG-101]
slug: lead-cohort-autoenroll
---

## Goal

Când un lead este convertit în student (`POST /api/leads/:id/convert`) și lead-ul are
`courseId` setat (INTEG-101), sistemul caută automat cea mai apropiată cohortă activă sau
viitoare pentru acel curs și înscrie studentul ca participant cu `source: "crm"`,
`paymentStatus: "pending"`.

Dacă nu există nicio cohortă activă/viitoare pentru cursul respectiv, conversia continuă
normal fără eroare — auto-enroll este oportunistic, nu blocant.

## In scope

- PATCH `POST /api/leads/:id/convert`: după crearea studentului, dacă `lead.courseId` ≠ null,
  caută cohortă activă/upcoming pentru acel curs (categoria ≠ "past"), alege prima după startDate asc.
- Dacă găsește cohortă, inserează în `cohort_participants` cu source="crm", paymentStatus="pending",
  fullName copiat din student, email/phone copiate dacă există.
- Răspunsul extinde cu `autoEnrolledCohortId: string | null`.
- Tests: T-INTEG-201-1..5 verzi.
- Fără migrare nouă (tabele existente).

## Out of scope

- UI pentru selectarea manuală a cohortei la conversie (item separat).
- Deduplicare participant (dacă studentul era deja în cohortă, întoarce conflictul fără crash).

## User stories

- **US-1**: Ca manager, vreau ca leadul să fie înscris automat la cohortă la conversie pentru a elimina pasul manual.
- **US-2**: Ca manager, vreau ca dacă nu există cohortă activă, conversia să reușească fără eroare.

## Acceptance criteria

- [ ] AC1: POST /api/leads/:id/convert cu lead.courseId setat → studentul apare în cohort_participants.
- [ ] AC2: Auto-enroll alege cohorta cu startDate cel mai apropiat (upcoming/active, nu past).
- [ ] AC3: Răspunsul conține autoEnrolledCohortId (uuid sau null).
- [ ] AC4: Dacă nu există cohortă pentru cursul respectiv → autoEnrolledCohortId: null, fără eroare.
- [ ] AC5: Participant creat cu source="crm", paymentStatus="pending", tenant-safe.
- [ ] AC6: Dacă lead.courseId null → autoEnrolledCohortId: null, fără tentativă de enroll.

## Tests

- **T-INTEG-201-1** `[blocant]` Conversia cu courseId setat → autoEnrolledCohortId ≠ null.
- **T-INTEG-201-2** `[blocant]` Participant creat cu source="crm", paymentStatus="pending".
- **T-INTEG-201-3** `[blocant]` Conversia fără courseId → autoEnrolledCohortId: null (no crash).
- **T-INTEG-201-4** Conversia când nu există cohortă pentru curs → autoEnrolledCohortId: null.
- **T-INTEG-201-5** Logica de selecție a cohortei alege upcoming/active, nu past.

## Definition of Done

- [ ] AC1-6 bifate; T-INTEG-201-1..5 verzi; build+typecheck+lint+test verzi
- [ ] Fără migrare.

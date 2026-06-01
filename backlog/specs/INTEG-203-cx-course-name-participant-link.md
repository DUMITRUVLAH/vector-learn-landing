---
id: INTEG-203
title: "Integrare: CX cohortă — afișare curs + link participant→student"
milestone: INTEG
phase: 2
status: pending
depends_on: [INTEG-201, CX-703]
slug: cx-course-name-participant-link
---

## Goal

Închide inelul CX↔Courses↔Students:

1. **CohortHeader** afișează numele cursului (din `cohort.courseId` JOIN courses) cu un link către `/app/courses`.
2. **ParticipantTable** — participanții cu `source='crm'` (i.e. `studentId` non-null) au un link clickabil pe numele lor → `/app/students/:studentId` (fișa studentului).

Fără aceste două linkuri, managerul trebuie să navigheze manual între CX, Cursuri și Studenți — rupând fluxul.

## In scope

- `GET /api/cohorts` (sau `GET /api/cohorts/:id`) returnează `courseId` + `courseName` (JOIN courses).
- `CohortHeader` afișează `courseName` cu link (dacă `courseId` e prezent).
- `ParticipantTable` — celula cu `fullName` a participanților `source='crm'` devine link `<a href="#/app/students/:studentId">`.
- Zero hardcoded colors; semantic tokens; dark mode; WCAG AA.

## Out of scope

- Editare curs din CX (separat).
- Linkuri pentru participanți manuali (aceștia nu au `studentId`).

## User stories

- **US-1**: Ca manager, vreau să văd imediat ce curs este legat de o cohortă, fără să navighez separat în Cursuri.
- **US-2**: Ca manager, vreau să deschid fișa studentului dintr-un participant CRM cu un singur click.
- **US-3**: Ca manager, vreau să văd rapid dacă o cohortă NU are curs asociat (link absent = avertisment implicit).

## Acceptance criteria

- [ ] AC1: `GET /api/cohorts` include `courseName` (string sau null) pentru fiecare cohortă.
- [ ] AC2: `CohortHeader` afișează `courseName` cu un link sau badge; dacă null → nu afișează nimic (graceful).
- [ ] AC3: Participanții `source='crm'` cu `studentId` non-null → `fullName` e un `<a>` cu href `#/app/students/:studentId`.
- [ ] AC4: Participanții `source='manual'` rămân text simplu.
- [ ] AC5: tenant-safe; zero `any`; fără raw `.execute().rows`; link-uri nu produc erori 404.

## Files

### Modified
- `server/routes/cohorts.ts` — JOIN courses pentru `courseName` în `listCohorts`
- `src/lib/api/cohorts.ts` — tipul `Cohort` adaugă `courseId?: string | null`, `courseName?: string | null`
- `src/components/modules/cx/CohortTabs.tsx` — (opțional) afișare curs în selector
- `src/pages/app/CXPage.tsx` — `CohortHeader` afișează courseName + link
- `src/components/modules/cx/ParticipantTable.tsx` — link pe fullName pentru source='crm'

## Tests

- **T-INTEG-203-1** `[blocant]` `GET /api/cohorts` include `courseName` (string sau null) pentru fiecare cohortă.
- **T-INTEG-203-2** `[blocant]` `CohortHeader` cu `courseName` setat → render include courseName.
- **T-INTEG-203-3** `[blocant]` `ParticipantTable` cu participant `source='crm'` + `studentId` → link `href` conține studentId.
- **T-INTEG-203-4** Participant `source='manual'` → fără link (text simplu).
- **T-INTEG-203-5** API smoke: `GET /api/cohorts` → 200 cu array (tenant autenticat).

## Definition of Done

- [ ] AC1-5; T-INTEG-203-1..5 verzi; build+typecheck+lint+test verzi
- [ ] No hardcoded colors; dark mode OK; a11y: link are text descriptiv

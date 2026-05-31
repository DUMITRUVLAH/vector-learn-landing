---
id: CX-701
title: "CX: model ediție de curs (cohorta) + funcții end-date/progress — portate din copy-roas"
milestone: CX
phase: 1
status: pending
depends_on: [SCHED-502, CRM-111]
slug: edition-model
---

## Goal

Portează **modelul de „ediție de curs" (cohortă)** și cele trei funcții pure din copy-roas
(`useCXData.ts`) care fac toată matematica de calendar a unei cohorte. În copy-roas o ediție e
rândul `course_edition_costs` (curs + ediție + `start_date` + `total_hours` + `hours_per_session`
+ `schedule_days[]` + costuri mentor/sală). La noi avem deja `courses` și `lessonSeries`
(`dayOfWeek`, `occurrences`) — extindem cu o entitate explicită de cohortă peste ele, **tenant-safe**.

Această fază NU aduce UI încă — aduce schema, rutele și funcțiile de business pe care le consumă
CX-702..705.

---

## Idei de cod trase din copy-roas (referință, NU copy-paste)

`src/hooks/useCXData.ts` din copy-roas conține:

- `calculateCourseEndDate(startDate, totalHours, hoursPerSession, scheduleDays)`:
  `totalSessions = ceil(totalHours / hoursPerSession)`; sare zi cu zi din `startDate`,
  numără doar zilele din `scheduleDays`, până atinge `totalSessions`. Fallback 8 săptămâni (56 zile)
  dacă nu există `scheduleDays`. **Portează 1:1 ca util pur** (`server/lib/cohortDates.ts` + oglindă
  în `src/lib/`), cu `date-fns` (avem deja).
- `calculateCourseProgress(startDate, endDate)`: întoarce `{ daysRemaining, daysUntilStart,
  progressPercent, isCompleted, isUpcoming }`. Portează 1:1.
- Gruparea Active / Upcoming / Past: **Active = start în luna curentă sau luna viitoare**;
  Upcoming = după luna viitoare; Past = înainte de luna curentă. Portează ca selectoare.

## In scope

- Schema nouă `server/db/schema/cohorts.ts`:
  - `cohorts` (= „ediția"): `id`, `tenantId` (FK cascade), `courseId` (FK → courses),
    `label` (ex. „Ediția Mai 2026"), `startDate date`, `totalHours integer`,
    `hoursPerSession integer default 2`, `scheduleDays jsonb` (string[] zile EN: Monday..Sunday),
    `isOnline boolean default false`, `manualEndDate date null`, `mentorCostCents integer default 0`,
    `roomCostCents integer default 0`, `driveFolderUrl varchar null`, timestamps.
  - Index pe `(tenantId, courseId)` și pe `(tenantId, startDate)`.
- Export în `server/db/schema/index.ts`.
- `server/lib/cohortDates.ts`: `calculateCohortEndDate`, `calculateCohortProgress`,
  `classifyCohort(startDate) → "active" | "upcoming" | "past"` — funcții pure, testate.
- `server/routes/cohorts.ts`: CRUD tenant-safe (`GET /api/cohorts`, `POST`, `PATCH /:id`,
  `DELETE /:id`), toate filtrate pe `tenantId` din context auth. `GET` întoarce și
  `endDate`+`progress` calculate.
- Înregistrare rută în app + middleware auth/tenant existent.
- Migrație Drizzle generată și **committed**.

## Out of scope

- UI tab-uri/tabele (CX-702).
- Participanți (CX-703).
- Break-even/profit (CX-705).

---

## User stories

- **US-1**: Ca manager, vreau să definesc o cohortă (curs + dată start + program) ca să urmăresc o
  grupă concretă de cursanți.
- **US-2**: Ca sistem, vreau data de final și progresul calculate automat din ore + program.

---

## Acceptance criteria

- [ ] AC1: `cohorts` există cu `tenantId` FK cascade; migrație committed; `db:reset`+`db:seed` trec.
- [ ] AC2: `calculateCohortEndDate` reproduce exact logica din copy-roas (test cu același input/output:
      32h, 2h/sesiune, [Tuesday,Thursday], start luni → 16 sesiuni → dată corectă).
- [ ] AC3: `calculateCohortProgress` întoarce `isUpcoming` pentru start în viitor, `isCompleted`
      pentru end în trecut, `progressPercent` clamp 0..100.
- [ ] AC4: `GET /api/cohorts` întoarce DOAR cohortele tenantului curent (tenant isolation testat).
- [ ] AC5: Login + `GET/POST/PATCH/DELETE /api/cohorts` întorc 200 (smoke API §3.5.1).
- [ ] AC6: zero `any`; fără raw `.execute().rows`.

---

## Files

### New
- `server/db/schema/cohorts.ts`
- `server/lib/cohortDates.ts`
- `src/lib/cohortDates.ts` (oglindă client, sau import din shared)
- `server/routes/cohorts.ts`
- `server/db/migrations/<generated>_cohorts.sql`
- `src/__tests__/cx/cohort-dates.test.ts`
- `server/__tests__/cohorts.routes.test.ts`

### Modified
- `server/db/schema/index.ts`
- `server/app.ts` (sau unde se montează rutele)

---

## Tests

- **T-CX-701-1** `[blocant]` `calculateCohortEndDate(2026-05-04, 32, 2, [Tuesday,Thursday])` → dată
  egală cu referința copy-roas (16 sesiuni).
- **T-CX-701-2** `[blocant]` Fără `scheduleDays` → end = start + 56 zile.
- **T-CX-701-3** `[blocant]` `GET /api/cohorts` pentru tenant A nu vede cohortele tenant B.
- **T-CX-701-4** `calculateCohortProgress` clamp 0..100 + flags corecte.

---

## Definition of Done

- [ ] AC-uri; T-CX-701-1..4 trec; build+typecheck+lint+test verzi
- [ ] Migration gate + API smoke + portability verzi (§3.5.1)

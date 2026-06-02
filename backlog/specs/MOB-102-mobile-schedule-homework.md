---
id: MOB-102
title: Mobile schedule + homework list + submit
milestone: MOB
phase: "1"
status: pending
priority: P0
depends_on: [MOB-101]
spec: backlog/specs/MOB-102-mobile-schedule-homework.md
---

## Goal

Mobile-first schedule view (`/m/schedule`) — day view with swipe between days, compact
lesson cards. Homework list (`/m/homework`) — sorted by deadline with "overdue only" filter.
Students can submit homework with text or a photo upload. Teachers see submissions in a
grading view `/app/grading`.

---

## User stories

- **Ca Elev**, vreau să scroll vertical orarul săptămânii, pentru că văd rapid pe mobil.
- **Ca Elev**, vreau lista temelor cu deadline + status, pentru că le prioritizez.
- **Ca Elev**, vreau să atașez o poză cu tema scrisă, pentru că profesorul o vede direct.
- **Ca Profesor**, vreau să văd submisiile elevilor în /app/grading, pentru că le evaluez rapid.

---

## Acceptance criteria

1. Route `/m/schedule` — shows current week (Mon-Sun), day-view with swipe (CSS scroll-snap
   or swipeable tabs). Each lesson card: subject, time range, teacher name, room.
2. Route `/m/homework` — lists all `homework` records for the current student, sorted by
   `deadline ASC`. "Doar restante" filter shows only `status = 'pending'` + deadline past.
3. DB: new table `homework` with columns:
   `id UUID PK`, `tenant_id UUID FK tenants(id)`, `lesson_id UUID FK lessons(id)`,
   `student_id UUID FK students(id)`, `body TEXT`, `deadline TIMESTAMPTZ NOT NULL`,
   `status VARCHAR(20) DEFAULT 'pending'` (pending | submitted | graded),
   `created_at`, `updated_at`.
4. DB: new table `homework_submissions` with columns:
   `id UUID PK`, `homework_id UUID FK homework(id)`, `student_id UUID FK students(id)`,
   `text_body TEXT`, `image_url TEXT`, `submitted_at TIMESTAMPTZ DEFAULT now()`.
5. API `POST /api/m/homework/:id/submit` — accepts `{ text_body?, image_url? }`,
   creates submission, sets homework status → `submitted`.
6. Route `/app/grading` — teacher sees all submitted homework for their lessons; shows
   student name, lesson, submission text + image (if any).
7. Migration file committed (`0037_mob102_homework.sql`).
8. `db:reset && db:seed` succeeds after migration.
9. Unit tests for homework list render + submit action.

---

## Files

- `server/db/schema/homework.ts` — new schema
- `server/db/schema/index.ts` — export homework + submissions
- `drizzle/0037_mob102_homework.sql` — new migration
- `server/routes/mobile.ts` — GET `/api/m/schedule`, GET `/api/m/homework`, POST `/api/m/homework/:id/submit`
- `server/routes/grading.ts` — new: GET `/api/grading/homework` (teacher view)
- `server/routes.ts` — mount grading router
- `src/pages/app/mobile/SchedulePage.tsx` — new
- `src/pages/app/mobile/HomeworkPage.tsx` — new
- `src/pages/app/mobile/HomeworkPage.test.tsx` — new
- `src/pages/app/GradingPage.tsx` — new teacher grading view
- router — add `/m/schedule`, `/m/homework`, `/app/grading` routes

---

## Tests

- **T-MOB-102-1** `[blocant]` Given migration applied, When `db:reset && db:seed`, Then succeeds with no errors.
- **T-MOB-102-2** `[blocant]` Given student token, When GET `/api/m/homework`, Then 200 with array of homework objects.
- **T-MOB-102-3** `[blocant]` Given homework exists, When POST `/api/m/homework/:id/submit` with `{text_body: "done"}`, Then 200 and homework status → "submitted".
- **T-MOB-102-4** `[normal]` Given `HomeworkPage` rendered with mock homework list, When component mounts, Then renders homework items sorted by deadline.
- **T-MOB-102-5** `[normal]` Given "Doar restante" filter toggled, When filtered, Then only overdue pending items shown.

---

## Definition of Done

- [ ] Tables `homework`, `homework_submissions` migrated
- [ ] `/m/schedule`, `/m/homework` routes working
- [ ] Homework submit API works
- [ ] `/app/grading` teacher view works
- [ ] All T-MOB-102-* tests green
- [ ] Migration gate green (db:reset + db:seed)
- [ ] Reviewer APPROVED
- [ ] PR on `feat/MOB-faza-1-student-pwa`

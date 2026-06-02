---
id: COURSE-102
title: "Groups (classes) as entities — schema, API, and UI"
milestone: COURSE
phase: "1"
status: pending
depends_on: [COURSE-101]
---

## Goal

Introduce `groups` as the central scheduling entity. A group belongs to a course, has a teacher, a room, a schedule template (day-of-week + time), and a max-student capacity. Lessons will reference a group. This enables proper enrollment and timetable generation.

## User stories

- Ca Manager, vreau să creez "Engleză B2 — Grupa Mar/Joi 14:00" ca entitate separată, pentru că programez lecții recurente la grupă, nu la curs.
- Ca Manager, vreau să setez "max 8 elevi în Engleză B2 grupa A", pentru că nu suprapopulez clasa.
- Ca Manager, vreau să văd câte locuri rămase are fiecare grupă, pentru că consiliez părintele imediat.
- Ca Recepționer, vreau să selectez o grupă la înrolarea unui elev, pentru că legătura elev↔grupă generează automat lecțiile și plata.

## Acceptance criteria

- [ ] New table `groups` (id uuid PK, tenant_id FK, course_id FK, teacher_id FK nullable, room_id FK nullable, name varchar(200), schedule_template jsonb, max_students int default 20, status varchar(16) default 'active', created_at, updated_at)
- [ ] `schedule_template` shape: `{ days: string[], startTime: string, endTime: string }` — stored as jsonb
- [ ] Migration: `<next>_course102_groups.sql`
- [ ] `GET /api/groups` — lists all active groups for tenant; optional `?courseId=` filter; returns `spotsRemaining` (max_students minus enrolled count)
- [ ] `POST /api/groups` — create group; validates courseId belongs to tenant
- [ ] `PATCH /api/groups/:id` — edit name, teacher, room, schedule, max_students, status
- [ ] `DELETE /api/groups/:id` — soft-archive (status='archived')
- [ ] `GET /api/groups/:id` — single group with enrolled student list
- [ ] UI page `/app/groups` — table: Group name, Course, Teacher, Schedule, Enrolled/Max, Status
- [ ] Create/Edit slide-over — course picker, teacher picker (from /api/teachers), room picker, day-of-week checkboxes, startTime/endTime, max_students
- [ ] Capacity badge: green (spots available), orange (<3 spots), red (full)
- [ ] "Waitlist" label when full (data only — no waitlist queue yet)
- [ ] Groups linked from CoursesPage (course row → "X grupe")
- [ ] Dark mode parity; no hardcoded hex; aria labels on all buttons

## Files to create/modify

### Backend
- `server/db/schema/groups.ts` — new table definition
- `server/db/schema/index.ts` — export groups
- `drizzle/<next>_course102_groups.sql` — migration
- `server/routes/groups.ts` — full CRUD
- `server/index.ts` — mount groupRoutes at `/api/groups`

### Frontend
- `src/pages/app/GroupsPage.tsx`
- `src/components/app/GroupForm.tsx`
- `src/components/app/GroupRow.tsx`

### Tests
- `src/__tests__/groups.test.ts`

## Tests

- **T-COURSE-102-1** [blocant] Given migration applied, When `npm run db:reset && npm run db:seed`, Then `groups` table exists with correct columns
- **T-COURSE-102-2** [blocant] Given server booted, When POST /api/auth/login + GET /api/groups, Then 200 with `items` array (live API smoke)
- **T-COURSE-102-3** [blocant] Given a group with 5 enrolled students and max_students=8, When GET /api/groups, Then `spotsRemaining=3` in result
- **T-COURSE-102-4** [normal] Given POST /api/groups with invalid courseId (wrong tenant), Then 400/404 returned
- **T-COURSE-102-5** [normal] Given GroupsPage renders, When course filter applied, Then only groups for that course visible
- **T-COURSE-102-6** [normal] Given a full group (enrolled=max), When the UI renders, Then capacity badge shows red "Full"

## Definition of Done

- Migration committed, `db:reset` + `db:seed` pass
- All acceptance criteria checked
- Reviewer APPROVED
- Integration-architect CONNECTED (groups → courses FK; groups → teachers FK; groups → rooms FK)
- Personas reviewed
- PR on same `feat/COURSE-faza-1-management` branch

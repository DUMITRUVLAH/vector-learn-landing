---
id: COURSE-101
title: "Course management UX — edit, archive, CEFR level, search"
milestone: COURSE
phase: "1"
status: pending
depends_on: []
---

## Goal

Complete the course CRUD: add PATCH (edit) + soft-archive to the backend, and expose a full management UI with search/filter, CEFR level dropdown, and inline edit/archive actions. No new DB tables — add `status` and `cefrLevel` columns to `courses`.

## User stories

- Ca Manager, vreau să editez prețul și descrierea unui curs activ, pentru că tarifele se schimbă la fiecare an școlar.
- Ca Manager, vreau să arhivez un curs care nu se mai oferă, pentru că nu vreau să îl văd în dropdown-uri dar trebuie să rămână în istoricul plăților.
- Ca Recepționer, vreau să caut "engleză" și să filtrez pe nivel CEFR, pentru că consiliez rapid părintele.
- Ca Director de școală de limbi, vreau să văd nivelul CEFR (A1-C2) al cursului, pentru că rapoartele arată progresia standardizată.

## Acceptance criteria

- [ ] Migration adds `status varchar(16) DEFAULT 'active'` and `cefr_level varchar(4)` to `courses`
- [ ] `PATCH /api/courses/:id` — accepts partial body (name, description, level, cefrLevel, defaultPriceCents, durationMinutes, status); tenant-scoped; returns updated row
- [ ] `DELETE /api/courses/:id` — changes to soft-archive (`status = 'archived'`) instead of hard delete; returns `{ ok: true }`
- [ ] `GET /api/courses` — filters out `archived` by default; accepts `?includeArchived=true` to show all
- [ ] UI page `/app/courses` — table with columns: Name, Level, CEFR, Price, Duration, Status
- [ ] Search input — live filter on name (client-side; server-side if >200 rows)
- [ ] Filter chips: All / Active / Archived
- [ ] Edit button → slide-over form with all fields; CEFR dropdown (A1, A2, B1, B2, C1, C2, blank)
- [ ] Archive action → confirm dialog "Arhivezi cursul X? Nu va mai apărea în dropdown-uri."
- [ ] Dark mode parity; semantic tokens only; no hardcoded hex
- [ ] TypeScript strict — no `any`; Zod schema for PATCH body

## Files to create/modify

### Backend
- `server/db/schema/courses.ts` — add `status`, `cefrLevel`
- `drizzle/<next>_course101_status_cefr.sql` — migration
- `server/routes/courses.ts` — add PATCH, modify DELETE (soft), update GET filter

### Frontend
- `src/pages/app/CoursesPage.tsx` — full management page
- `src/components/app/CourseForm.tsx` — slide-over form (create + edit)
- `src/components/app/CourseRow.tsx` — table row with actions

### Tests
- `src/__tests__/courses.test.ts` — unit tests for PATCH + soft-delete + filter

## Tests

- **T-COURSE-101-1** [blocant] Given a valid PATCH /api/courses/:id with `{name:"Updated", status:"archived"}`, When the request is sent with valid auth, Then 200 is returned with the updated row and `status="archived"`
- **T-COURSE-101-2** [blocant] Given migration applied, When `npm run db:reset && npm run db:seed` runs, Then no error and `courses` table has `status` and `cefr_level` columns
- **T-COURSE-101-3** [blocant] Given server booted, When POST /api/auth/login + GET /api/courses, Then 200 with `items` array (live API smoke)
- **T-COURSE-101-4** [normal] Given a course with `status="archived"`, When GET /api/courses (default), Then that course does NOT appear in results
- **T-COURSE-101-5** [normal] Given `?includeArchived=true`, When GET /api/courses, Then archived courses ARE included
- **T-COURSE-101-6** [normal] Given CoursesPage renders, When user types "engleză" in search, Then only matching courses are visible

## Definition of Done

- Migration committed, `db:reset` + `db:seed` pass
- All acceptance criteria checked
- Reviewer APPROVED
- Integration-architect CONNECTED
- Manager + Student personas reviewed
- PR open on `feat/COURSE-faza-1-management`
